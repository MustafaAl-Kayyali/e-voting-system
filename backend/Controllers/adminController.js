const Election = require('../Models/electionModel');
const Candidate = require('../Models/candidateModel');
const Voter = require('../Models/voterModel');
const Vote = require('../Models/voteModel');
const Administrator = require('../Models/administratorModel');
const AuditLog = require('../Models/auditLogModel');
const { createBlockchainHash } = require('../utils/authUtils');

const createElection = async (req, res) => {
  try {
    const {
      title,
      description,
      type,
      startDate,
      endDate,
      electoralDistricts,
      candidates, 
      settings
    } = req.body;

    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);

    let formattedDistricts = [];
    if (typeof electoralDistricts === 'string' && electoralDistricts.trim()) {
      formattedDistricts = electoralDistricts.split(',').map(name => ({ name: name.trim() }));
    } else if (Array.isArray(electoralDistricts)) {
      formattedDistricts = electoralDistricts.map(d => {
        if (typeof d === 'string') return { name: d.trim() };
        return d;
      });
    }

    // 1. Create the election first without candidates to get ID
    const election = await Election.create({
      title,
      description,
      type,
      startDate: start,
      endDate: end,
      status: start <= now && end > now ? 'active' : 'draft',
      electoralDistricts: formattedDistricts,
      settings: {
        ...settings,
        allowMultipleVotes: settings?.allowMultipleVotes || false,
        maxVotesPerVoter: settings?.maxVotesPerVoter || 1,
        requireTwoFactor: settings?.requireTwoFactor !== false,
        enableBiometric: settings?.enableBiometric || false,
        publishResultsImmediately: settings?.publishResultsImmediately !== false,
        allowAudit: settings?.allowAudit !== false
      },
      createdBy: req.user._id,
      blockchainHash: createBlockchainHash({
        title,
        type,
        startDate,
        endDate,
        createdBy: req.user._id,
        timestamp: Date.now()
      })
    });

    // 2. Process candidate names if provided
    let candidateIds = [];
    if (candidates && Array.isArray(candidates)) {
      for (const candidateName of candidates) {
        if (!candidateName.trim()) continue;
        
        const nameParts = candidateName.trim().split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Candidate';

        const newCandidate = await Candidate.create({
          firstName,
          lastName,
          party: 'Independent',
          position: type,
          electoralDistrict: formattedDistricts.length > 0 ? formattedDistricts[0].name : 'General',
          isApproved: true,
          status: 'approved',
          elections: [election._id]
        });
        candidateIds.push(newCandidate._id);
      }
    }

    // 3. Update election with candidate IDs
    election.candidates = candidateIds;
    // Also initialize results array for these candidates
    election.results = candidateIds.map(id => ({
      candidate: id,
      votes: 0,
      percentage: 0
    }));
    await election.save();

    await AuditLog.create({
      eventType: 'election_created',
      userId: req.user._id,
      userModel: req.user.constructor.modelName || 'User',
      action: 'create_election',
      description: `Election "${title}" created`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.get('User-Agent'),
      details: {
        electionId: election._id,
        title: election.title,
        type: election.type
      },
      severity: 'high',
      category: 'administration'
    });

    res.status(201).json({
      status: 'success',
      message: 'Election created successfully',
      data: {
        election: {
          id: election._id,
          title: election.title,
          description: election.description,
          type: election.type,
          startDate: election.startDate,
          endDate: election.endDate,
          status: election.status,
          settings: election.settings
        }
      }
    });
  } catch (error) {
    console.error('Create Election Error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Error creating election',
      details: error.errors
    });
  }
};

const getElections = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    const filter = {};
    if (status) {
      filter.status = status;
    }

    const elections = await Election.find(filter)
      .populate('createdBy', 'name email')
      .populate('candidates', 'firstName lastName party')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Election.countDocuments(filter);

    res.status(200).json({
      status: 'success',
      results: elections.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        elections
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching elections',
      error: error.message
    });
  }
};

const updateElection = async (req, res) => {
  try {
    const { electionId } = req.params;
    const updates = req.body;

    const election = await Election.findById(electionId);
    
    if (!election) {
      return res.status(404).json({
        status: 'fail',
        message: 'Election not found'
      });
    }

    if (election.status === 'active') {
      const allowedUpdates = ['endDate', 'settings'];
      const updateKeys = Object.keys(updates);
      const hasRestrictedUpdates = updateKeys.some(key => !allowedUpdates.includes(key));
      
      if (hasRestrictedUpdates) {
        return res.status(400).json({
          status: 'fail',
          message: 'Cannot modify active election except for end date and settings'
        });
      }
    }

    const oldValues = {};
    Object.keys(updates).forEach(key => {
      oldValues[key] = election[key];
    });

    Object.assign(election, updates);
    election.updatedAt = new Date();

    await election.save();

    await AuditLog.create({
      eventType: 'admin_action',
      userId: req.user._id,
      userModel: req.user.constructor.modelName || 'User',
      action: 'update_election',
      description: `Election "${election.title}" updated`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.get('User-Agent'),
      details: {
        electionId: election._id,
        oldValue: oldValues,
        newValue: updates
      },
      severity: 'medium',
      category: 'administration'
    });

    res.status(200).json({
      status: 'success',
      message: 'Election updated successfully',
      data: {
        election
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error updating election',
      error: error.message
    });
  }
};

const startElection = async (req, res) => {
  try {
    const { electionId } = req.params;
    
    const election = await Election.findById(electionId);
    
    if (!election) {
      return res.status(404).json({
        status: 'fail',
        message: 'Election not found'
      });
    }

    if (election.status !== 'draft') {
      return res.status(400).json({
        status: 'fail',
        message: 'Only draft elections can be started'
      });
    }

    const now = new Date();
    if (election.startDate > now) {
      return res.status(400).json({
        status: 'fail',
        message: 'Election start date is in the future'
      });
    }

    election.status = 'active';
    election.updatedAt = now;
    await election.save();

    await AuditLog.create({
      eventType: 'election_started',
      userId: req.user._id,
      userModel: req.user.constructor.modelName || 'User',
      action: 'start_election',
      description: `Election "${election.title}" started`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.get('User-Agent'),
      details: {
        electionId: election._id,
        startedAt: now
      },
      severity: 'high',
      category: 'administration'
    });

    res.status(200).json({
      status: 'success',
      message: 'Election started successfully',
      data: {
        election: {
          id: election._id,
          title: election.title,
          status: election.status,
          startedAt: now
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error starting election',
      error: error.message
    });
  }
};

const pauseElection = async (req, res) => {
  try {
    const { electionId } = req.params;
    const { reason } = req.body || {};
    
    const election = await Election.findById(electionId);
    
    if (!election) {
      return res.status(404).json({
        status: 'fail',
        message: 'Election not found'
      });
    }

    if (election.status !== 'active') {
      return res.status(400).json({
        status: 'fail',
        message: 'Only active elections can be paused'
      });
    }

    election.status = 'paused';
    election.updatedAt = new Date();
    await election.save();

    await AuditLog.create({
      eventType: 'election_paused',
      userId: req.user._id,
      userModel: req.user.constructor.modelName || 'User',
      action: 'pause_election',
      description: `Election "${election.title}" paused`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.get('User-Agent'),
      details: {
        electionId: election._id,
        metadata: {
          pausedAt: new Date(),
          reason: reason || 'Emergency pause'
        }
      },
      severity: 'high',
      category: 'administration'
    });

    res.status(200).json({
      status: 'success',
      message: 'Election paused successfully',
      data: {
        election: {
          id: election._id,
          title: election.title,
          status: election.status,
          pausedAt: new Date()
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error pausing election',
      error: error.message
    });
  }
};

const endElection = async (req, res) => {
  try {
    const { electionId } = req.params;
    
    const election = await Election.findById(electionId)
      .populate('candidates', 'firstName lastName party votes');
    
    if (!election) {
      return res.status(404).json({
        status: 'fail',
        message: 'Election not found'
      });
    }

    if (election.status === 'completed') {
      return res.status(400).json({
        status: 'fail',
        message: 'Election is already completed'
      });
    }

    const votes = await Vote.find({ election: electionId });
    const validVotes = votes.filter(vote => vote.isValid);
    const invalidVotes = votes.filter(vote => !vote.isValid);

    election.totalVotes = votes.length;
    election.validVotes = validVotes.length;
    election.invalidVotes = invalidVotes.length;
    election.status = 'completed';
    election.updatedAt = new Date();

    if (election.settings.publishResultsImmediately) {
      election.isResultsPublished = true;
    }

    await election.save();

    await AuditLog.create({
      eventType: 'election_ended',
      userId: req.user._id,
      userModel: req.user.constructor.modelName || 'User',
      action: 'end_election',
      description: `Election "${election.title}" ended and results calculated`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.get('User-Agent'),
      details: {
        electionId: election._id,
        totalVotes: election.totalVotes,
        validVotes: election.validVotes,
        invalidVotes: election.invalidVotes,
        endedAt: new Date()
      },
      severity: 'high',
      category: 'administration'
    });

    res.status(200).json({
      status: 'success',
      message: 'Election ended successfully',
      data: {
        election: {
          id: election._id,
          title: election.title,
          status: election.status,
          totalVotes: election.totalVotes,
          validVotes: election.validVotes,
          invalidVotes: election.invalidVotes,
          results: election.results,
          isResultsPublished: election.isResultsPublished
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error ending election',
      error: error.message
    });
  }
};

const getElectionResults = async (req, res) => {
  try {
    const { electionId } = req.params;
    
    const election = await Election.findById(electionId)
      .populate('candidates', 'firstName lastName party photo')
      .populate('results.candidate', 'firstName lastName party');
    
    if (!election) {
      return res.status(404).json({
        status: 'fail',
        message: 'Election not found'
      });
    }

    if (election.status !== 'completed' && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'fail',
        message: 'Results are not available yet'
      });
    }

    const User = require('../Models/userModel');
    const votes = await Vote.find({ election: electionId });
    const voterTurnout = (await Vote.distinct('voter', { election: electionId })).length;
    const eligibleVoters = await User.countDocuments({ role: 'voter' });

    const results = {
      election: {
        id: election._id,
        title: election.title,
        type: election.type,
        status: election.status,
        totalVotes: election.totalVotes,
        validVotes: election.validVotes,
        invalidVotes: election.invalidVotes,
        voterTurnout,
        eligibleVoters,
        turnoutPercentage: eligibleVoters > 0 ? (voterTurnout / eligibleVoters) * 100 : 0
      },
      candidates: election.results.map(result => ({
        candidate: result.candidate,
        votes: result.votes,
        percentage: result.percentage
      })).sort((a, b) => b.votes - a.votes),
      isPublished: election.isResultsPublished
    };

    res.status(200).json({
      status: 'success',
      data: {
        results
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching election results',
      error: error.message
    });
  }
};

const publishResults = async (req, res) => {
  try {
    const { electionId } = req.params;
    
    const election = await Election.findById(electionId);
    
    if (!election) {
      return res.status(404).json({
        status: 'fail',
        message: 'Election not found'
      });
    }

    if (election.status !== 'completed') {
      return res.status(400).json({
        status: 'fail',
        message: 'Only completed elections can have published results'
      });
    }

    election.isResultsPublished = true;
    election.updatedAt = new Date();
    await election.save();

    await AuditLog.create({
      eventType: 'admin_action',
      userId: req.user._id,
      userModel: req.user.constructor.modelName || 'User',
      action: 'publish_results',
      description: `Results for election "${election.title}" published`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.get('User-Agent'),
      details: {
        electionId: election._id,
        publishedAt: new Date()
      },
      severity: 'high',
      category: 'administration'
    });

    res.status(200).json({
      status: 'success',
      message: 'Results published successfully',
      data: {
        election: {
          id: election._id,
          title: election.title,
          isResultsPublished: true,
          publishedAt: new Date()
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error publishing results',
      error: error.message
    });
  }
};

module.exports = {createElection,getElections,updateElection,startElection,pauseElection,endElection,getElectionResults,publishResults};
