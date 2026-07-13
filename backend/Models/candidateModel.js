const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true
  },
  party: {
    type: String,
    required: [true, 'Party is required'],
    trim: true
  },
  position: {
    type: String,
    required: [true, 'Position is required'],
    trim: true
  },
  electoralDistrict: {
    type: String,
    required: [true, 'Electoral district is required'],
    trim: true
  },
  biography: {
    type: String,
    trim: true
  },
  photo: {
    type: String,
    default: ''
  },
  campaignPlatform: {
    type: String,
    trim: true
  },
  contactInfo: {
    email: {
      type: String,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    website: {
      type: String,
      trim: true
    }
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Administrator'
  },
  approvedAt: {
    type: Date
  },
  elections: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Election'
  }],
  votes: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'withdrawn'],
    default: 'pending'
  },
  rejectionReason: {
    type: String,
    trim: true
  },
  documents: [{
    name: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
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

candidateSchema.methods.canParticipate = function(electionId) {
  return this.isApproved && 
         this.status === 'approved' && 
         this.elections.some(id => id.toString() === electionId.toString());
};

candidateSchema.index({ firstName: 1, lastName: 1 });
candidateSchema.index({ electoralDistrict: 1 });
candidateSchema.index({ party: 1 });
candidateSchema.index({ status: 1 });

module.exports = mongoose.model('Candidate', candidateSchema);
