const express = require('express');
const {
  verifyDistributedRegisterIntegrity,
  getSystemLogs,
  generateAuditReport,
  getVoterActivityAnalysis,
  getSystemPerformanceMetrics
} = require('../Controllers/auditorController');
const { protect, restrictTo, auditLog } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.use(restrictTo('super_admin', 'auditor'));

router.post('/elections/:electionId/verify-integrity', 
  auditLog('admin_action', 'audit_integrity', 'Performed distributed register integrity audit'),
  verifyDistributedRegisterIntegrity
);

router.get('/logs', 
  auditLog('data_access', 'view_system_logs', 'Viewed system logs'),
  getSystemLogs
);

router.post('/reports/generate', 
  auditLog('admin_action', 'generate_audit_report', 'Generated audit report'),
  generateAuditReport
);

router.get('/analytics/voter-activity', 
  auditLog('data_access', 'view_voter_activity', 'Viewed voter activity analysis'),
  getVoterActivityAnalysis
);

router.get('/metrics/system-performance', 
  auditLog('data_access', 'view_system_metrics', 'Viewed system performance metrics'),
  getSystemPerformanceMetrics
);

module.exports = router;
