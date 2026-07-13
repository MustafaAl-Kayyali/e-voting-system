const Voter = require('../Models/voterModel');
const Election = require('../Models/electionModel');
const AuditLog = require('../Models/auditLogModel');
const { sanitizeInput, validateEmail } = require('../utils/authUtils');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');

const storage = multer.memoryStorage();
const upload = multer({ storage });

const addVoterToWhitelist = async (req, res) => {
  try {
    const { voterId } = req.params;
    
    const voter = await Voter.findById(voterId);
    
    if (!voter) {
      return res.status(404).json({
        status: 'fail',
        message: 'Voter not found'
      });
    }

    if (voter.isWhitelisted) {
      return res.status(400).json({
        status: 'fail',
        message: 'Voter is already whitelisted'
      });
    }

    voter.isWhitelisted = true;
    voter.updatedAt = new Date();
    await voter.save();

    await AuditLog.create({
      eventType: 'voter_verified',
      userId: req.user._id,
      userModel: 'Administrator',
      action: 'whitelist_voter',
      description: `Voter ${voter.firstName} ${voter.lastName} added to whitelist`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        voterId: voter._id,
        nationalId: voter.nationalId,
        whitelistedAt: new Date()
      },
      severity: 'medium',
      category: 'administration'
    });

    res.status(200).json({
      status: 'success',
      message: 'Voter added to whitelist successfully',
      data: {
        voter: {
          id: voter._id,
          firstName: voter.firstName,
          lastName: voter.lastName,
          nationalId: voter.nationalId,
          isWhitelisted: true,
          isVerified: voter.isVerified
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error adding voter to whitelist',
      error: error.message
    });
  }
};

const removeVoterFromWhitelist = async (req, res) => {
  try {
    const { voterId } = req.params;
    
    const voter = await Voter.findById(voterId);
    
    if (!voter) {
      return res.status(404).json({
        status: 'fail',
        message: 'Voter not found'
      });
    }

    if (!voter.isWhitelisted) {
      return res.status(400).json({
        status: 'fail',
        message: 'Voter is not whitelisted'
      });
    }

    if (voter.hasVoted) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot remove voter from whitelist after they have voted'
      });
    }

    voter.isWhitelisted = false;
    voter.updatedAt = new Date();
    await voter.save();

    await AuditLog.create({
      eventType: 'admin_action',
      userId: req.user._id,
      userModel: 'Administrator',
      action: 'remove_whitelist_voter',
      description: `Voter ${voter.firstName} ${voter.lastName} removed from whitelist`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        voterId: voter._id,
        nationalId: voter.nationalId,
        removedAt: new Date()
      },
      severity: 'medium',
      category: 'administration'
    });

    res.status(200).json({
      status: 'success',
      message: 'Voter removed from whitelist successfully',
      data: {
        voter: {
          id: voter._id,
          firstName: voter.firstName,
          lastName: voter.lastName,
          isWhitelisted: false
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error removing voter from whitelist',
      error: error.message
    });
  }
};

const verifyVoter = async (req, res) => {
  try {
    const { voterId } = req.params;
    
    const voter = await Voter.findById(voterId);
    
    if (!voter) {
      return res.status(404).json({
        status: 'fail',
        message: 'Voter not found'
      });
    }

    if (voter.isVerified) {
      return res.status(400).json({
        status: 'fail',
        message: 'Voter is already verified'
      });
    }

    voter.isVerified = true;
    voter.updatedAt = new Date();
    await voter.save();

    await AuditLog.create({
      eventType: 'voter_verified',
      userId: req.user._id,
      userModel: 'Administrator',
      action: 'verify_voter',
      description: `Voter ${voter.firstName} ${voter.lastName} verified`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        voterId: voter._id,
        nationalId: voter.nationalId,
        verifiedAt: new Date()
      },
      severity: 'medium',
      category: 'administration'
    });

    res.status(200).json({
      status: 'success',
      message: 'Voter verified successfully',
      data: {
        voter: {
          id: voter._id,
          firstName: voter.firstName,
          lastName: voter.lastName,
          isVerified: true,
          isWhitelisted: voter.isWhitelisted
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error verifying voter',
      error: error.message
    });
  }
};

const getVoters = async (req, res) => {
  try {
    const { 
      status, 
      electoralDistrict, 
      isVerified, 
      isWhitelisted, 
      hasVoted,
      page = 1, 
      limit = 10 
    } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (electoralDistrict) filter.electoralDistrict = electoralDistrict;
    if (isVerified !== undefined) filter.isVerified = isVerified === 'true';
    if (isWhitelisted !== undefined) filter.isWhitelisted = isWhitelisted === 'true';
    if (hasVoted !== undefined) filter.hasVoted = hasVoted === 'true';

    const voters = await Voter.find(filter)
      .select('-password -twoFactorSecret')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Voter.countDocuments(filter);

    res.status(200).json({
      status: 'success',
      results: voters.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        voters
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching voters',
      error: error.message
    });
  }
};

const uploadVoterRegistry = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'fail',
        message: 'No file uploaded'
      });
    }

    const results = [];
    const errors = [];
    let processedCount = 0;
    let successCount = 0;

    const buffer = req.file.buffer.toString('utf-8');
    const lines = buffer.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const [nationalId, firstName, lastName, email, phoneNumber, dateOfBirth, electoralDistrict] = line.split(',').map(field => field.trim());
        
        if (!nationalId || !firstName || !lastName || !email || !phoneNumber || !dateOfBirth || !electoralDistrict) {
          errors.push({ line: i + 1, error: 'Missing required fields' });
          continue;
        }

        if (!validateEmail(email)) {
          errors.push({ line: i + 1, error: 'Invalid email format', email });
          continue;
        }

        const existingVoter = await Voter.findOne({
          $or: [{ email }, { nationalId }]
        });

        if (existingVoter) {
          if (!existingVoter.isWhitelisted) {
            existingVoter.isWhitelisted = true;
            existingVoter.isVerified = true;
            existingVoter.updatedAt = new Date();
            await existingVoter.save();
            successCount++;
            results.push({
              action: 'updated',
              nationalId,
              email,
              status: 'updated'
            });
          } else {
            errors.push({ line: i + 1, error: 'Voter already exists and is whitelisted', email });
          }
        } else {
          const newVoter = await Voter.create({
            nationalId: sanitizeInput(nationalId),
            firstName: sanitizeInput(firstName),
            lastName: sanitizeInput(lastName),
            email: sanitizeInput(email),
            phoneNumber: sanitizeInput(phoneNumber),
            dateOfBirth: new Date(dateOfBirth),
            electoralDistrict: sanitizeInput(electoralDistrict),
            isWhitelisted: true,
            isVerified: true,
            password: 'tempPassword123'
          });
          
          successCount++;
          results.push({
            action: 'created',
            nationalId,
            email,
            voterId: newVoter._id,
            status: 'created'
          });
        }
        
        processedCount++;
      } catch (error) {
        errors.push({ line: i + 1, error: error.message });
      }
    }

    await AuditLog.create({
      eventType: 'voter_registered',
      userId: req.user._id,
      userModel: 'Administrator',
      action: 'bulk_upload_voters',
      description: `Bulk upload of ${processedCount} voters processed`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        processedCount,
        successCount,
        errorCount: errors.length,
        errors: errors.slice(0, 10)
      },
      severity: 'high',
      category: 'administration'
    });

    res.status(200).json({
      status: 'success',
      message: 'Voter registry upload processed',
      data: {
        summary: {
          processedCount,
          successCount,
          errorCount: errors.length
        },
        results: results.slice(0, 100),
        errors: errors.slice(0, 50)
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error processing voter registry upload',
      error: error.message
    });
  }
};

const assignVotersToElection = async (req, res) => {
  try {
    const { electionId } = req.params;
    const { voterIds, electoralDistricts } = req.body;
    
    const election = await Election.findById(electionId);
    
    if (!election) {
      return res.status(404).json({
        status: 'fail',
        message: 'Election not found'
      });
    }

    let votersToAdd = [];
    
    if (voterIds && voterIds.length > 0) {
      votersToAdd = await Voter.find({
        '_id': { $in: voterIds },
        'isWhitelisted': true,
        'isVerified': true
      });
    } else if (electoralDistricts && electoralDistricts.length > 0) {
      votersToAdd = await Voter.find({
        'electoralDistrict': { $in: electoralDistricts },
        'isWhitelisted': true,
        'isVerified': true
      });
    }

    if (votersToAdd.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'No eligible voters found for the specified criteria'
      });
    }

    for (const district of election.electoralDistricts) {
      const districtVoters = votersToAdd.filter(voter => 
        voter.electoralDistrict === district.name
      );
      
      const existingVoterIds = district.eligibleVoters.map(id => id.toString());
      const newVoterIds = districtVoters
        .map(voter => voter._id.toString())
        .filter(id => !existingVoterIds.includes(id));
      
      district.eligibleVoters.push(...newVoterIds);
    }

    await election.save();

    await AuditLog.create({
      eventType: 'admin_action',
      userId: req.user._id,
      userModel: 'Administrator',
      action: 'assign_voters_election',
      description: `Assigned ${votersToAdd.length} voters to election ${election.title}`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        electionId: election._id,
        assignedCount: votersToAdd.length,
        assignedAt: new Date()
      },
      severity: 'high',
      category: 'administration'
    });

    res.status(200).json({
      status: 'success',
      message: 'Voters assigned to election successfully',
      data: {
        election: {
          id: election._id,
          title: election.title,
          totalEligibleVoters: election.electoralDistricts.reduce(
            (total, district) => total + district.eligibleVoters.length, 
            0
          )
        },
        assignedVoters: votersToAdd.length
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error assigning voters to election',
      error: error.message
    });
  }
};

const getVoterRegistryStats = async (req, res) => {
  try {
    const { electionId } = req.query;
    
    let matchStage = {};
    if (electionId) {
      const election = await Election.findById(electionId);
      if (election) {
        const eligibleVoterIds = election.electoralDistricts.flatMap(
          district => district.eligibleVoters
        );
        matchStage = { '_id': { $in: eligibleVoterIds } };
      }
    }

    const stats = await Voter.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalVoters: { $sum: 1 },
          verifiedVoters: { $sum: { $cond: ['$isVerified', 1, 0] } },
          whitelistedVoters: { $sum: { $cond: ['$isWhitelisted', 1, 0] } },
          votedVoters: { $sum: { $cond: ['$hasVoted', 1, 0] } },
          twoFactorEnabled: { $sum: { $cond: ['$isTwoFactorEnabled', 1, 0] } }
        }
      }
    ]);

    const districtStats = await Voter.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$electoralDistrict',
          count: { $sum: 1 },
          verified: { $sum: { $cond: ['$isVerified', 1, 0] } },
          whitelisted: { $sum: { $cond: ['$isWhitelisted', 1, 0] } },
          voted: { $sum: { $cond: ['$hasVoted', 1, 0] } }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const result = stats[0] || {
      totalVoters: 0,
      verifiedVoters: 0,
      whitelistedVoters: 0,
      votedVoters: 0,
      twoFactorEnabled: 0
    };

    res.status(200).json({
      status: 'success',
      data: {
        ...result,
        verificationRate: result.totalVoters > 0 ? (result.verifiedVoters / result.totalVoters) * 100 : 0,
        whitelistRate: result.totalVoters > 0 ? (result.whitelistedVoters / result.totalVoters) * 100 : 0,
        turnoutRate: result.totalVoters > 0 ? (result.votedVoters / result.totalVoters) * 100 : 0,
        twoFactorRate: result.totalVoters > 0 ? (result.twoFactorEnabled / result.totalVoters) * 100 : 0,
        districtBreakdown: districtStats
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching voter registry statistics',
      error: error.message
    });
  }
};

module.exports = {
  addVoterToWhitelist,
  removeVoterFromWhitelist,
  verifyVoter,
  getVoters,
  uploadVoterRegistry: [upload.single('file'), uploadVoterRegistry],
  assignVotersToElection,
  getVoterRegistryStats
};
