const express = require('express');
const {
  getElections,
  getElectionCandidates,
  castVote,
  getVoteJobStatus,
  verifyVote,
  getVoterVotes,
  getVotingStatus
} = require('../Controllers/votingController');
const {
  protect,
  restrictToVoter,
  validateCastVoteBody,
  auditLog
} = require('../middleware/auth');
const idempotency = require('../middleware/idempotency');
const { voteCastLimiter } = require('../config/rateLimiters');

const router = express.Router();

router.use(protect);
router.use(restrictToVoter);

router.get('/elections', 
  auditLog('data_access', 'view_elections', 'Viewed available elections'),
  getElections
);

router.get('/elections/:electionId/candidates', 
  auditLog('data_access', 'view_candidates', 'Viewed election candidates'),
  getElectionCandidates
);

router.post('/vote',
  voteCastLimiter(),
  validateCastVoteBody,
  idempotency,
  castVote
);

router.get('/vote/jobs/:jobId',
  getVoteJobStatus
);

router.get('/vote/verify/:receiptId', 
  auditLog('data_access', 'verify_vote', 'Verified vote receipt'),
  verifyVote
);

router.get('/votes', 
  auditLog('data_access', 'view_votes', 'Viewed voting history'),
  getVoterVotes
);

router.get('/status', 
  auditLog('data_access', 'view_voting_status', 'Viewed voting status'),
  getVotingStatus
);

module.exports = router;
