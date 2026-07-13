const Candidate = require('../Models/candidateModel');
const Election = require('../Models/electionModel');
const AuditLog = require('../Models/auditLogModel');
const { sanitizeInput } = require('../utils/authUtils');

const createCandidate = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      party,
      position,
      electoralDistrict,
      biography,
      campaignPlatform,
      contactInfo,
      documents
    } = req.body;

    const sanitizedData = {
      firstName: sanitizeInput(firstName),
      lastName: sanitizeInput(lastName),
      party: sanitizeInput(party),
      position: sanitizeInput(position),
      electoralDistrict: sanitizeInput(electoralDistrict),
      biography: sanitizeInput(biography),
      campaignPlatform: sanitizeInput(campaignPlatform)
    };

    const existingCandidate = await Candidate.findOne({
      firstName: sanitizedData.firstName,
      lastName: sanitizedData.lastName,
      electoralDistrict: sanitizedData.electoralDistrict,
      position: sanitizedData.position
    });

    if (existingCandidate) {
      return res.status(400).json({
        status: 'fail',
        message: 'A candidate with this information already exists for this position and district'
      });
    }

    const candidate = await Candidate.create({
      ...sanitizedData,
      contactInfo,
      documents: documents || [],
      status: 'pending'
    });

    await AuditLog.create({
      eventType: 'candidate_added',
      userId: req.user._id,
      userModel: 'Administrator',
      action: 'create_candidate',
      description: `New candidate ${candidate.firstName} ${candidate.lastName} added`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        candidateId: candidate._id,
        name: `${candidate.firstName} ${candidate.lastName}`,
        party: candidate.party,
        position: candidate.position
      },
      severity: 'medium',
      category: 'administration'
    });

    res.status(201).json({
      status: 'success',
      message: 'Candidate created successfully',
      data: {
        candidate: {
          id: candidate._id,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          party: candidate.party,
          position: candidate.position,
          electoralDistrict: candidate.electoralDistrict,
          status: candidate.status,
          createdAt: candidate.createdAt
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error creating candidate',
      error: error.message
    });
  }
};

const getCandidates = async (req, res) => {
  try {
    const { status, electoralDistrict, electionId, page = 1, limit = 10 } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (electoralDistrict) filter.electoralDistrict = electoralDistrict;
    if (electionId) filter.elections = electionId;

    const candidates = await Candidate.find(filter)
      .populate('elections', 'title type status')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Candidate.countDocuments(filter);

    res.status(200).json({
      status: 'success',
      results: candidates.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        candidates
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching candidates',
      error: error.message
    });
  }
};

const updateCandidate = async (req, res) => {
  try {
    const { candidateId } = req.params;
    const updates = req.body;

    const candidate = await Candidate.findById(candidateId);
    
    if (!candidate) {
      return res.status(404).json({
        status: 'fail',
        message: 'Candidate not found'
      });
    }

    if (candidate.status === 'approved' && candidate.elections.length > 0) {
      const allowedUpdates = ['biography', 'campaignPlatform', 'contactInfo', 'photo'];
      const updateKeys = Object.keys(updates);
      const hasRestrictedUpdates = updateKeys.some(key => !allowedUpdates.includes(key));
      
      if (hasRestrictedUpdates) {
        return res.status(400).json({
          status: 'fail',
          message: 'Cannot modify approved candidate details except for biography, campaign platform, contact info, and photo'
        });
      }
    }

    const oldValues = {};
    Object.keys(updates).forEach(key => {
      oldValues[key] = candidate[key];
    });

    Object.assign(candidate, updates);
    candidate.updatedAt = new Date();

    await candidate.save();

    await AuditLog.create({
      eventType: 'admin_action',
      userId: req.user._id,
      userModel: 'Administrator',
      action: 'update_candidate',
      description: `Candidate "${candidate.firstName} ${candidate.lastName}" updated`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        candidateId: candidate._id,
        oldValue: oldValues,
        newValue: updates
      },
      severity: 'medium',
      category: 'administration'
    });

    res.status(200).json({
      status: 'success',
      message: 'Candidate updated successfully',
      data: {
        candidate
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error updating candidate',
      error: error.message
    });
  }
};

const approveCandidate = async (req, res) => {
  try {
    const { candidateId } = req.params;
    const { electionIds } = req.body;
    
    const candidate = await Candidate.findById(candidateId);
    
    if (!candidate) {
      return res.status(404).json({
        status: 'fail',
        message: 'Candidate not found'
      });
    }

    if (candidate.status !== 'pending') {
      return res.status(400).json({
        status: 'fail',
        message: 'Only pending candidates can be approved'
      });
    }

    if (!electionIds || electionIds.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'At least one election must be specified for approval'
      });
    }

    const elections = await Election.find({ '_id': { $in: electionIds } });
    if (elections.length !== electionIds.length) {
      return res.status(400).json({
        status: 'fail',
        message: 'One or more elections not found'
      });
    }

    candidate.status = 'approved';
    candidate.isApproved = true;
    candidate.approvedBy = req.user._id;
    candidate.approvedAt = new Date();
    candidate.elections = electionIds;
    candidate.updatedAt = new Date();

    await candidate.save();

    for (const electionId of electionIds) {
      await Election.findByIdAndUpdate(
        electionId,
        { $addToSet: { candidates: candidate._id } }
      );
    }

    await AuditLog.create({
      eventType: 'candidate_approved',
      userId: req.user._id,
      userModel: 'Administrator',
      action: 'approve_candidate',
      description: `Candidate "${candidate.firstName} ${candidate.lastName}" approved`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        candidateId: candidate._id,
        electionIds,
        approvedAt: new Date()
      },
      severity: 'high',
      category: 'administration'
    });

    res.status(200).json({
      status: 'success',
      message: 'Candidate approved successfully',
      data: {
        candidate: {
          id: candidate._id,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          status: candidate.status,
          isApproved: candidate.isApproved,
          approvedAt: candidate.approvedAt,
          elections: candidate.elections
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error approving candidate',
      error: error.message
    });
  }
};

const rejectCandidate = async (req, res) => {
  try {
    const { candidateId } = req.params;
    const { reason } = req.body;
    
    const candidate = await Candidate.findById(candidateId);
    
    if (!candidate) {
      return res.status(404).json({
        status: 'fail',
        message: 'Candidate not found'
      });
    }

    if (candidate.status !== 'pending') {
      return res.status(400).json({
        status: 'fail',
        message: 'Only pending candidates can be rejected'
      });
    }

    candidate.status = 'rejected';
    candidate.rejectionReason = reason || 'Rejected by administrator';
    candidate.updatedAt = new Date();

    await candidate.save();

    await AuditLog.create({
      eventType: 'admin_action',
      userId: req.user._id,
      userModel: 'Administrator',
      action: 'reject_candidate',
      description: `Candidate "${candidate.firstName} ${candidate.lastName}" rejected`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        candidateId: candidate._id,
        rejectionReason: candidate.rejectionReason,
        rejectedAt: new Date()
      },
      severity: 'medium',
      category: 'administration'
    });

    res.status(200).json({
      status: 'success',
      message: 'Candidate rejected successfully',
      data: {
        candidate: {
          id: candidate._id,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          status: candidate.status,
          rejectionReason: candidate.rejectionReason
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error rejecting candidate',
      error: error.message
    });
  }
};

const deleteCandidate = async (req, res) => {
  try {
    const { candidateId } = req.params;
    
    const candidate = await Candidate.findById(candidateId);
    
    if (!candidate) {
      return res.status(404).json({
        status: 'fail',
        message: 'Candidate not found'
      });
    }

    if (candidate.status === 'approved' && candidate.elections.length > 0) {
      const activeElections = await Election.find({
        '_id': { $in: candidate.elections },
        'status': { $in: ['active', 'paused'] }
      });

      if (activeElections.length > 0) {
        return res.status(400).json({
          status: 'fail',
          message: 'Cannot delete candidate participating in active elections'
        });
      }
    }

    await Election.updateMany(
      { candidates: candidateId },
      { $pull: { candidates: candidateId } }
    );

    await Candidate.findByIdAndDelete(candidateId);

    await AuditLog.create({
      eventType: 'admin_action',
      userId: req.user._id,
      userModel: 'Administrator',
      action: 'delete_candidate',
      description: `Candidate "${candidate.firstName} ${candidate.lastName}" deleted`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        candidateId: candidate._id,
        deletedAt: new Date()
      },
      severity: 'high',
      category: 'administration'
    });

    res.status(200).json({
      status: 'success',
      message: 'Candidate deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error deleting candidate',
      error: error.message
    });
  }
};

const getCandidateStats = async (req, res) => {
  try {
    const { electionId } = req.query;
    
    const matchStage = electionId ? { elections: electionId } : {};
    
    const stats = await Candidate.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalCandidates = await Candidate.countDocuments(matchStage);
    const approvedCandidates = await Candidate.countDocuments({ ...matchStage, status: 'approved' });
    const pendingCandidates = await Candidate.countDocuments({ ...matchStage, status: 'pending' });
    const rejectedCandidates = await Candidate.countDocuments({ ...matchStage, status: 'rejected' });

    res.status(200).json({
      status: 'success',
      data: {
        totalCandidates,
        approvedCandidates,
        pendingCandidates,
        rejectedCandidates,
        breakdown: stats
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching candidate statistics',
      error: error.message
    });
  }
};

module.exports = {
  createCandidate,
  getCandidates,
  updateCandidate,
  approveCandidate,
  rejectCandidate,
  deleteCandidate,
  getCandidateStats
};
