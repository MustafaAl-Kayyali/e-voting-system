const mongoose = require('mongoose');

const electionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Election title is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Election description is required'],
    trim: true
  },
  type: {
    type: String,
    required: [true, 'Election type is required'],
    enum: ['presidential', 'parliamentary', 'local', 'municipal', 'referendum', 'club_president', 'company_ceo', 'union_leader', 'other']
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'completed', 'cancelled'],
    default: 'draft'
  },
  electoralDistricts: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    eligibleVoters: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Voter'
    }]
  }],
  candidates: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Candidate'
  }],
  totalVotes: {
    type: Number,
    default: 0
  },
  validVotes: {
    type: Number,
    default: 0
  },
  invalidVotes: {
    type: Number,
    default: 0
  },
  results: [{
    candidate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Candidate'
    },
    votes: {
      type: Number,
      default: 0
    },
    percentage: {
      type: Number,
      default: 0
    }
  }],
  settings: {
    allowMultipleVotes: {
      type: Boolean,
      default: false
    },
    maxVotesPerVoter: {
      type: Number,
      default: 1
    },
    requireTwoFactor: {
      type: Boolean,
      default: true
    },
    enableBiometric: {
      type: Boolean,
      default: false
    },
    publishResultsImmediately: {
      type: Boolean,
      default: true
    },
    allowAudit: {
      type: Boolean,
      default: true
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  blockchainHash: {
    type: String
  },
  isResultsPublished: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

electionSchema.pre('save', async function() {
  if (this.endDate <= this.startDate) {
    throw new Error('End date must be after start date');
  }
});

electionSchema.methods.isActive = function() {
  const now = new Date();
  return this.status === 'active' && 
         this.startDate <= now && 
         this.endDate >= now;
};

electionSchema.methods.canVote = async function(voterId) {
  if (this.status !== 'active') return false;
  
  const now = new Date();
  if (this.startDate > now || this.endDate < now) return false;

  // Find the voter to check their district
  const Voter = mongoose.model('Voter');
  const voter = await Voter.findById(voterId);
  if (!voter) return false;

  // If no districts are defined at all, it's a general election
  if (!this.electoralDistricts || this.electoralDistricts.length === 0) return true;

  const normalizeDistrict = (value) => String(value || '').trim().toLowerCase();
  const voterDistrictName = normalizeDistrict(voter.electoralDistrict);
  if (!voterDistrictName) return false;

  // Check if voter belongs to any of the election's districts
  const voterDistrict = this.electoralDistricts.find(d =>
    normalizeDistrict(d?.name) === voterDistrictName
  );

  if (!voterDistrict) return false;

  // If eligibleVoters list is defined and not empty, check if voter is in it
  if (voterDistrict.eligibleVoters && voterDistrict.eligibleVoters.length > 0) {
    return voterDistrict.eligibleVoters.some(id => id.toString() === voterId.toString());
  }

  // If eligibleVoters list is empty, any voter from that district can vote
  return true;
};

electionSchema.index({ startDate: 1, endDate: 1 });
electionSchema.index({ status: 1 });
electionSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Election', electionSchema);
