const mongoose = require('mongoose');
const crypto = require('crypto');

const voteSchema = new mongoose.Schema({
  voter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Voter',
    required: true
  },
  election: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Election',
    required: true
  },
  candidate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Candidate',
    required: true
  },
  encryptedVote: {
    type: String,
    required: true
  },
  voteHash: {
    type: String,
    unique: true
  },
  receipt: {
    id: {
      type: String,
      unique: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    blockchainHash: {
      type: String
    }
  },
  votingMethod: {
    type: String,
    enum: ['online', 'mobile', 'kiosk', 'mail'],
    default: 'online'
  },
  authenticationMethod: {
    type: String,
    enum: ['password', '2fa', 'biometric', 'multi_factor'],
    required: true
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  location: {
    latitude: Number,
    longitude: Number
  },
  isValid: {
    type: Boolean,
    default: true
  },
  isCounted: {
    type: Boolean,
    default: false
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected', 'flagged'],
    default: 'pending'
  },
  verificationNotes: {
    type: String,
    trim: true
  },
  auditTrail: [{
    action: {
      type: String,
      required: true
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'performedByModel'
    },
    performedByModel: {
      type: String,
      enum: ['Voter', 'Administrator', 'Auditor', 'User']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: {
      type: String,
      trim: true
    }
  }],
  blockchainTransactions: [{
    transactionHash: {
      type: String,
      required: true
    },
    blockNumber: {
      type: Number,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    confirmations: {
      type: Number,
      default: 0
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

voteSchema.methods.computeVoteHash = function() {
  const createdMs = this.createdAt ? this.createdAt.getTime() : Date.now();
  return crypto
    .createHash('sha256')
    .update(`${this.voter}_${this.election}_${this.candidate}_${createdMs}`)
    .digest('hex');
};

voteSchema.pre('save', async function() {
  if (this.isNew) {
    if (!this.createdAt) {
      this.createdAt = new Date();
    }

    if (!this.voteHash) {
      this.voteHash = this.computeVoteHash();
    }

    if (!this.receipt.id) {
      this.receipt.id = crypto
        .createHash('md5')
        .update(`${this.voter}_${this.election}_${this.createdAt.getTime()}`)
        .digest('hex');
    }
  }
});

voteSchema.methods.verifyIntegrity = function() {
  if (!this.voteHash) return false;
  return this.voteHash === this.computeVoteHash();
};

voteSchema.methods.addToAuditTrail = function(action, performedBy, performedByModel, details) {
  this.auditTrail.push({
    action,
    performedBy,
    performedByModel,
    details
  });
  return this.save();
};

voteSchema.index({ election: 1, candidate: 1 });
voteSchema.index({ verificationStatus: 1 });
voteSchema.index({ createdAt: 1 });
voteSchema.index({ voter: 1, election: 1 }, { unique: true });

module.exports = mongoose.model('Vote', voteSchema);
