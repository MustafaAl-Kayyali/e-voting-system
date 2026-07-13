const Vote = require('../Models/voteModel');
const Voter = require('../Models/voterModel');
const Election = require('../Models/electionModel');
const { castVoteAtomic, VoteCastError } = require('../services/voteCastService');
const { enqueueCastVote } = require('../services/voteEnqueueService');
const { serializeCastVoteResult } = require('../services/voteResultSerializer');
const { isDistributedVotingEnabled } = require('../config/redis');
const { getVoteQueue } = require('../queues/voteQueue');

const getElections = async (req, res) => {
  try {
    const elections = await Election.find({
      status: 'active'
    })
    .populate('candidates', 'firstName lastName party position electoralDistrict')
    .select('title description type startDate endDate electoralDistricts status');

    const now = new Date();
    const filteredByDate = elections.filter(e => e.startDate <= now && e.endDate >= now);

    const voter = await Voter.findById(req.user._id);
    if (!voter) {
        return res.status(404).json({
            status: 'fail',
            message: 'Voter record not found'
        });
    }

    const canVoteResults = await Promise.all(
      filteredByDate.map(async (election) => {
        const canVote = await election.canVote(voter._id);
        const hasNotVoted = !voter.votedInElections.some(voted => {
          const votedId = voted.election._id ? voted.election._id : voted.election;
          return votedId.toString() === election._id.toString();
        });
        return (canVote && hasNotVoted) ? election : null;
      })
    );

    const availableElections = canVoteResults.filter(election => election !== null);

    res.status(200).json({
      status: 'success',
      results: availableElections.length,
      data: {
        elections: availableElections
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

const getElectionCandidates = async (req, res) => {
  try {
    const { electionId } = req.params;

    const election = await Election.findById(electionId)
      .populate('candidates', 'firstName lastName party position biography photo electoralDistrict')
      .select('title description electoralDistricts status startDate endDate');

    if (!election) {
      return res.status(404).json({
        status: 'fail',
        message: 'Election not found'
      });
    }

    if (!election.isActive()) {
      return res.status(400).json({
        status: 'fail',
        message: 'Election is not currently active'
      });
    }

    const voter = await Voter.findById(req.user._id);
    if (!voter) {
        return res.status(404).json({
            status: 'fail',
            message: 'Voter record not found'
        });
    }

    const voterDistrict = (voter.electoralDistrict || '').trim().toLowerCase();
    const eligibleCandidates = election.candidates.filter((candidate) => {
      const candidateDistrict = (candidate.electoralDistrict || '').trim().toLowerCase();
      if (!voterDistrict || !candidateDistrict) return true;
      return candidateDistrict === voterDistrict;
    });

    res.status(200).json({
      status: 'success',
      results: eligibleCandidates.length,
      data: {
        election: {
          id: election._id,
          title: election.title,
          description: election.description
        },
        candidates: eligibleCandidates
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching election candidates',
      error: error.message
    });
  }
};

const validateTwoFactorForVote = async (req) => {
  if (!req.user.isTwoFactorEnabled) return true;

  const { twoFactorToken } = req.body;
  if (!twoFactorToken) {
    const err = new VoteCastError(
      'Two-factor authentication token is required to cast a vote',
      400,
      'TWO_FACTOR_REQUIRED'
    );
    throw err;
  }

  const voterWith2fa = await Voter.findById(req.user._id).select('+twoFactorSecret');
  const { verifyTwoFactorToken } = require('../utils/authUtils');
  const isValid = verifyTwoFactorToken(twoFactorToken, voterWith2fa.twoFactorSecret);
  if (!isValid) {
    throw new VoteCastError('Invalid two-factor authentication token', 401, 'TWO_FACTOR_INVALID');
  }
  return true;
};

const buildVotePayload = (req) => {
  const { electionId, candidateId, authenticationMethod } = req.body;
  return {
    voterId: req.user._id.toString(),
    electionId,
    candidateId,
    authenticationMethod: authenticationMethod || 'password',
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  };
};

const castVote = async (req, res) => {
  try {
    const { authenticationMethod } = req.body;
    await validateTwoFactorForVote(req);

    const payload = buildVotePayload(req);

    if (isDistributedVotingEnabled()) {
      const job = await enqueueCastVote(payload);

      return res.status(202).json({
        status: 'accepted',
        message: 'Vote queued for processing',
        data: {
          jobId: job.id,
          state: 'queued',
          pollUrl: `/api/voting/vote/jobs/${job.id}`
        }
      });
    }

    const result = await castVoteAtomic({
      ...payload,
      voterId: req.user._id
    });

    return res.status(201).json({
      status: 'success',
      message: 'Vote cast successfully',
      data: serializeCastVoteResult(result)
    });
  } catch (error) {
    if (error instanceof VoteCastError) {
      return res.status(error.statusCode).json({
        status: 'fail',
        message: error.message,
        code: error.code
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Error casting vote',
      error: error.message
    });
  }
};

const getVoteJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const queue = getVoteQueue();

    if (!queue) {
      return res.status(503).json({
        status: 'fail',
        message: 'Distributed voting is not enabled'
      });
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return res.status(404).json({
        status: 'fail',
        message: 'Vote job not found'
      });
    }

    if (job.data.voterId !== req.user._id.toString()) {
      return res.status(403).json({
        status: 'fail',
        message: 'You can only check your own vote jobs'
      });
    }

    const state = await job.getState();
    const response = {
      jobId: job.id,
      state,
      attemptsMade: job.attemptsMade
    };

    if (state === 'completed') {
      return res.status(200).json({
        status: 'success',
        message: 'Vote cast successfully',
        data: {
          ...response,
          result: job.returnvalue
        }
      });
    }

    if (state === 'failed') {
      const reason = job.failedReason || 'Vote processing failed';
      let code;
      let message = reason;
      if (job.stacktrace?.[0]?.includes('VoteCastError') || reason.includes('already voted')) {
        code = 'ALREADY_VOTED';
        message = 'You have already voted in this election';
      }
      return res.status(400).json({
        status: 'fail',
        message,
        code,
        data: response
      });
    }

    return res.status(200).json({
      status: 'pending',
      message: 'Vote is still being processed',
      data: response
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching vote job status',
      error: error.message
    });
  }
};

const verifyVote = async (req, res) => {
  try {
    const { receiptId } = req.params;

    if (!receiptId || typeof receiptId !== 'string' || receiptId.length > 128) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid receipt ID'
      });
    }
    
    const vote = await Vote.findOne({ 'receipt.id': receiptId })
      .populate('voter', 'firstName lastName email')
      .populate('election', 'title description')
      .populate('candidate', 'firstName lastName party');

    if (!vote) {
      return res.status(404).json({
        status: 'fail',
        message: 'Vote not found'
      });
    }

    if (vote.voter._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: 'fail',
        message: 'You can only verify your own votes'
      });
    }

    const integrityCheck = vote.verifyIntegrity();
    const blockchainValid = vote.receipt.blockchainHash
      ? require('../utils/authUtils').verifyVoteIntegrity(
          {
            voteId: vote._id,
            voterId: vote.voter._id,
            electionId: vote.election._id,
            candidateId: vote.candidate._id,
            timestamp: vote.receipt.timestamp
          },
          vote.receipt.blockchainHash
        )
      : false;

    res.status(200).json({
      status: 'success',
      data: {
        vote: {
          id: vote._id,
          election: {
            title: vote.election.title,
            description: vote.election.description
          },
          candidate: {
            firstName: vote.candidate.firstName,
            lastName: vote.candidate.lastName,
            party: vote.candidate.party
          },
          receipt: {
            id: vote.receipt.id,
            timestamp: vote.receipt.timestamp,
            blockchainHash: vote.receipt.blockchainHash
          },
          votingMethod: vote.votingMethod,
          verificationStatus: vote.verificationStatus,
          integrityVerified: integrityCheck,
          blockchainVerified: blockchainValid,
          createdAt: vote.createdAt
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error verifying vote',
      error: error.message
    });
  }
};

const getVoterVotes = async (req, res) => {
  try {
    const votes = await Vote.find({ voter: req.user._id })
      .populate('election', 'title type startDate endDate status')
      .populate('candidate', 'firstName lastName party position')
      .select('receipt votingMethod verificationStatus createdAt')
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      results: votes.length,
      data: {
        votes: votes.map(vote => ({
          id: vote._id,
          election: vote.election,
          candidate: vote.candidate,
          receipt: vote.receipt,
          votingMethod: vote.votingMethod,
          verificationStatus: vote.verificationStatus,
          votedAt: vote.createdAt
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching voter votes',
      error: error.message
    });
  }
};

const getVotingStatus = async (req, res) => {
  try {
    const voter = await Voter.findById(req.user._id)
      .populate('votedInElections.election', 'title status startDate endDate');

    const activeElections = await Election.find({
      status: 'active',
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    if (!voter) {
      return res.status(200).json({
        status: 'success',
        data: {
          voter: {
            hasVoted: false,
            votedInElections: [],
            isVerified: false,
            isWhitelisted: false
          },
          availableElections: [],
          statistics: {
            totalActiveElections: activeElections.length,
            availableToVote: 0,
            alreadyVotedIn: 0
          }
        }
      });
    }

    const canVoteResults = await Promise.all(
      activeElections.map(async (election) => {
        const canVote = await election.canVote(voter._id);
        const hasNotVoted = !voter.votedInElections.some(voted => {
          const votedId = voted.election._id ? voted.election._id : voted.election;
          return votedId.toString() === election._id.toString();
        });
        return (canVote && hasNotVoted) ? election : null;
      })
    );

    const availableElections = canVoteResults.filter(election => election !== null);

    res.status(200).json({
      status: 'success',
      data: {
        voter: {
          hasVoted: voter.votedInElections.length > 0,
          votedInElections: voter.votedInElections,
          isVerified: voter.isVerified,
          isWhitelisted: voter.isWhitelisted
        },
        availableElections: availableElections.map(election => ({
          id: election._id,
          title: election.title,
          type: election.type,
          startDate: election.startDate,
          endDate: election.endDate,
          canVote: true
        })),
        statistics: {
          totalActiveElections: activeElections.length,
          availableToVote: availableElections.length,
          alreadyVotedIn: voter.votedInElections.length
        }
      }
    });
  } catch (error) {
    console.error('Get Voting Status Error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching voting status',
      error: error.message
    });
  }
};

module.exports = {
  getElections,
  getElectionCandidates,
  castVote,
  getVoteJobStatus,
  verifyVote,
  getVoterVotes,
  getVotingStatus
};
