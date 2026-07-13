const express = require('express');
const {
  createElection,
  getElections,
  updateElection,
  startElection,
  pauseElection,
  endElection,
  getElectionResults,
  publishResults
} = require('../Controllers/adminController');
const { protect, restrictTo, auditLog } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.use(restrictTo('super_admin', 'election_admin', 'admin'));

router.post('/elections', 
  auditLog('admin_action', 'create_election', 'Created new election'),
  createElection
);

router.get('/elections', 
  auditLog('data_access', 'view_elections', 'Viewed all elections'),
  getElections
);

router.patch('/elections/:electionId', 
  auditLog('admin_action', 'update_election', 'Updated election'),
  updateElection
);

router.post('/elections/:electionId/start', 
  auditLog('election_started', 'start_election', 'Started election'),
  startElection
);

router.post('/elections/:electionId/pause', 
  auditLog('election_paused', 'pause_election', 'Paused election'),
  pauseElection
);

router.post('/elections/:electionId/end', 
  auditLog('election_ended', 'end_election', 'Ended election'),
  endElection
);

router.get('/elections/:electionId/results', 
  auditLog('data_access', 'view_results', 'Viewed election results'),
  getElectionResults
);

router.post('/elections/:electionId/publish-results', 
  auditLog('admin_action', 'publish_results', 'Published election results'),
  publishResults
);

module.exports = router;
