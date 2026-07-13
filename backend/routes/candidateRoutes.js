const express = require('express');
const {
  createCandidate,
  getCandidates,
  updateCandidate,
  approveCandidate,
  rejectCandidate,
  deleteCandidate,
  getCandidateStats
} = require('../Controllers/candidateController');
const { protect, restrictTo, auditLog } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.use(restrictTo('super_admin', 'election_admin', 'admin'));

router.post('/', 
  auditLog('admin_action', 'create_candidate', 'Created new candidate'),
  createCandidate
);

router.get('/', 
  auditLog('data_access', 'view_candidates', 'Viewed all candidates'),
  getCandidates
);

router.get('/stats', 
  auditLog('data_access', 'view_candidate_stats', 'Viewed candidate statistics'),
  getCandidateStats
);

router.patch('/:candidateId', 
  auditLog('admin_action', 'update_candidate', 'Updated candidate'),
  updateCandidate
);

router.post('/:candidateId/approve', 
  auditLog('candidate_approved', 'approve_candidate', 'Approved candidate'),
  approveCandidate
);

router.post('/:candidateId/reject', 
  auditLog('admin_action', 'reject_candidate', 'Rejected candidate'),
  rejectCandidate
);

router.delete('/:candidateId', 
  auditLog('admin_action', 'delete_candidate', 'Deleted candidate'),
  deleteCandidate
);

module.exports = router;
