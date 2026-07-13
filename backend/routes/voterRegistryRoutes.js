const express = require('express');
const {
  addVoterToWhitelist,
  removeVoterFromWhitelist,
  verifyVoter,
  getVoters,
  uploadVoterRegistry,
  assignVotersToElection,
  getVoterRegistryStats
} = require('../Controllers/voterRegistryController');
const { protect, restrictTo, auditLog } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.use(restrictTo('super_admin', 'voter_registry_admin', 'admin'));

router.get('/', 
  auditLog('data_access', 'view_voters', 'Viewed voter registry'),
  getVoters
);

router.get('/stats', 
  auditLog('data_access', 'view_voter_stats', 'Viewed voter registry statistics'),
  getVoterRegistryStats
);

router.post('/upload', 
  auditLog('voter_registered', 'bulk_upload_voters', 'Uploaded voter registry'),
  uploadVoterRegistry
);

router.post('/assign/:electionId', 
  auditLog('admin_action', 'assign_voters_election', 'Assigned voters to election'),
  assignVotersToElection
);

router.post('/:voterId/whitelist', 
  auditLog('voter_verified', 'whitelist_voter', 'Added voter to whitelist'),
  addVoterToWhitelist
);

router.delete('/:voterId/whitelist', 
  auditLog('admin_action', 'remove_whitelist_voter', 'Removed voter from whitelist'),
  removeVoterFromWhitelist
);

router.post('/:voterId/verify', 
  auditLog('voter_verified', 'verify_voter', 'Verified voter'),
  verifyVoter
);

module.exports = router;
