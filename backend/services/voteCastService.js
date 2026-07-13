const mongoose = require('mongoose');
const Vote = require('../Models/voteModel');
const Voter = require('../Models/voterModel');
const Election = require('../Models/electionModel');
const Candidate = require('../Models/candidateModel');
const AuditLog = require('../Models/auditLogModel');
const {
  generateEncryptedReceipt,
  createBlockchainHash,
  encryptSensitiveData
} = require('../utils/authUtils');

class VoteCastError extends Error {
  constructor(message, statusCode = 400, code = 'VOTE_CAST_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

const isDuplicateKeyError = (err) =>
  err && (err.code === 11000 || err.code === 11001);

const isTransactionUnsupported = (err) => {
  const message = err?.message || '';
  return (
    message.includes('replica set') ||
    message.includes('Transaction numbers') ||
    message.includes('mongos')
  );
};

const assertObjectId = (value, label) => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    throw new VoteCastError(`Invalid ${label}`, 400, 'INVALID_ID');
  }
};

const withOptionalSession = (query, session) =>
  session ? query.session(session) : query;

async function executeCastVote({
  voterId,
  electionId,
  candidateId,
  authenticationMethod,
  ipAddress,
  userAgent,
  session = null
}) {
  const election = await withOptionalSession(
    Election.findById(electionId),
    session
  );
  if (!election) {
    throw new VoteCastError('Election not found', 404, 'ELECTION_NOT_FOUND');
  }

  if (!election.isActive()) {
    throw new VoteCastError('Election is not currently active', 400, 'ELECTION_INACTIVE');
  }

  const candidate = await withOptionalSession(
    Candidate.findById(candidateId),
    session
  );
  if (!candidate) {
    throw new VoteCastError('Candidate not found', 404, 'CANDIDATE_NOT_FOUND');
  }

  if (!candidate.canParticipate(electionId)) {
    throw new VoteCastError(
      'Candidate is not eligible for this election',
      400,
      'CANDIDATE_INELIGIBLE'
    );
  }

  const voter = await withOptionalSession(Voter.findById(voterId), session);
  if (!voter) {
    throw new VoteCastError('Voter record not found', 404, 'VOTER_NOT_FOUND');
  }

  if (voter.status !== 'active') {
    throw new VoteCastError('Voter account is not active', 403, 'VOTER_INACTIVE');
  }

  if (process.env.STRICT_VOTER_ELIGIBILITY === 'true') {
    if (!voter.isVerified || !voter.isWhitelisted) {
      throw new VoteCastError(
        'Voter must be verified and whitelisted before voting',
        403,
        'VOTER_NOT_ELIGIBLE'
      );
    }
  }

  const isEligible = await election.canVote(voter._id);
  if (!isEligible) {
    throw new VoteCastError(
      'You are not eligible to vote in this election',
      403,
      'NOT_ELIGIBLE'
    );
  }

  const priorVoteQuery = Vote.countDocuments({ voter: voterId, election: electionId });
  const priorVoteCount = await withOptionalSession(priorVoteQuery, session);

  const maxVotes = election.settings?.allowMultipleVotes
    ? Math.max(1, election.settings.maxVotesPerVoter || 1)
    : 1;

  if (priorVoteCount >= maxVotes) {
    throw new VoteCastError(
      'You have already voted in this election',
      400,
      'ALREADY_VOTED'
    );
  }

  const votePayload = {
    voter: voter._id,
    election: electionId,
    candidate: candidateId,
    encryptedVote: encryptSensitiveData(
      JSON.stringify({
        electionId,
        candidateId,
        timestamp: Date.now()
      })
    ),
    votingMethod: 'online',
    authenticationMethod,
    ipAddress,
    userAgent,
    isCounted: true,
    verificationStatus: 'verified'
  };

  const createOptions = session ? { session } : {};
  const [vote] = await Vote.create([votePayload], createOptions);

  const receipt = generateEncryptedReceipt(voter._id, electionId, candidateId);
  vote.receipt.id = receipt.receiptId;
  vote.receipt.timestamp = new Date(receipt.timestamp);
  vote.receipt.blockchainHash = createBlockchainHash({
    voteId: vote._id,
    voterId: voter._id,
    electionId,
    candidateId,
    timestamp: receipt.timestamp
  });

  await vote.save(createOptions);

  const voterUpdateOptions = session ? { session } : {};
  const voterMarkResult = await Voter.updateOne(
    {
      _id: voter._id,
      'votedInElections.election': { $ne: electionId }
    },
    {
      $set: { hasVoted: true },
      $push: {
        votedInElections: {
          election: electionId,
          votedAt: new Date()
        }
      }
    },
    voterUpdateOptions
  );

  if (voterMarkResult.matchedCount === 0 && priorVoteCount > 0) {
    throw new VoteCastError(
      'You have already voted in this election',
      400,
      'ALREADY_VOTED'
    );
  }

  election.totalVotes += 1;
  election.validVotes += 1;

  const candidateResult = election.results.find(
    (r) => r.candidate.toString() === candidateId.toString()
  );

  if (candidateResult) {
    candidateResult.votes += 1;
  } else {
    election.results.push({
      candidate: candidateId,
      votes: 1,
      percentage: 0
    });
  }

  if (election.totalVotes > 0) {
    for (const row of election.results) {
      row.percentage = (row.votes / election.totalVotes) * 100;
    }
  }

  await election.save(createOptions);

  await Candidate.updateOne(
    { _id: candidateId },
    { $inc: { votes: 1 } },
    voterUpdateOptions
  );

  await AuditLog.create(
    [
      {
        eventType: 'vote_cast',
        userId: voter._id,
        userModel: 'Voter',
        action: 'vote_cast',
        description: `Vote cast in election ${election.title}`,
        ipAddress,
        userAgent,
        details: {
          electionId,
          candidateId,
          voteId: vote._id,
          receiptId: receipt.receiptId
        },
        severity: 'high',
        category: 'voting'
      }
    ],
    createOptions
  );

  vote.auditTrail.push({
    action: 'vote_cast',
    performedBy: voter._id,
    performedByModel: 'Voter',
    details: `Vote cast for candidate ${candidate.firstName} ${candidate.lastName}`
  });
  await vote.save(createOptions);

  return {
    vote,
    receipt,
    election: { title: election.title },
    candidate: {
      firstName: candidate.firstName,
      lastName: candidate.lastName
    }
  };
}

async function castVoteWithTransaction(params) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await executeCastVote({ ...params, session });
    });
    return result;
  } finally {
    session.endSession();
  }
}

/**
 * Cast a vote with transaction when supported; unique index prevents double-vote races.
 */
async function castVoteAtomic(params) {
  assertObjectId(params.voterId, 'voter ID');
  assertObjectId(params.electionId, 'election ID');
  assertObjectId(params.candidateId, 'candidate ID');

  try {
    return await castVoteWithTransaction(params);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new VoteCastError(
        'You have already voted in this election',
        400,
        'ALREADY_VOTED'
      );
    }

    if (isTransactionUnsupported(err)) {
      try {
        return await executeCastVote(params);
      } catch (fallbackErr) {
        if (isDuplicateKeyError(fallbackErr)) {
          throw new VoteCastError(
            'You have already voted in this election',
            400,
            'ALREADY_VOTED'
          );
        }
        throw fallbackErr;
      }
    }

    throw err;
  }
}

module.exports = {
  castVoteAtomic,
  VoteCastError,
  assertObjectId,
  isDuplicateKeyError
};
