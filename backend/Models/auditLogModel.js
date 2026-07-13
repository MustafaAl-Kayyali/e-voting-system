const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  eventType: {
    type: String,
    required: [true, 'Event type is required'],
    enum: [
      'user_login',
      'user_logout',
      'vote_cast',
      'vote_verified',
      'election_created',
      'election_started',
      'election_paused',
      'election_ended',
      'candidate_added',
      'candidate_approved',
      'voter_registered',
      'voter_verified',
      'admin_registered',
      'admin_action',
      'system_error',
      'security_alert',
      'data_access',
      'config_change'
    ]
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'userModel',
    required: function() { return !this.isAnonymous && this.action !== 'login_failed'; }
  },
  userModel: {
    type: String,
    enum: ['Voter', 'Administrator', 'Auditor', 'User'],
    required: true
  },
  action: {
    type: String,
    required: [true, 'Action is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true
  },
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  success: {
    type: Boolean,
    default: true
  },
  errorCode: {
    type: String
  },
  errorMessage: {
    type: String
  },
  details: {
    electionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Election'
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Candidate'
    },
    voteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vote'
    },
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    metadata: mongoose.Schema.Types.Mixed
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },
  category: {
    type: String,
    enum: ['authentication', 'authorization', 'voting', 'administration', 'security', 'system'],
    default: 'system'
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  blockchainHash: {
    type: String
  },
  relatedEvents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AuditLog'
  }]
});

auditLogSchema.index({ eventType: 1, timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ severity: 1, timestamp: -1 });
auditLogSchema.index({ category: 1, timestamp: -1 });
auditLogSchema.index({ ipAddress: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
