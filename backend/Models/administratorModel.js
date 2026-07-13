const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const administratorSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
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
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 8,
    select: false
  },
  role: {
    type: String,
    enum: ['super_admin', 'election_admin', 'voter_registry_admin', 'auditor'],
    default: 'election_admin'
  },
  permissions: [{
    type: String,
    enum: [
      'create_election',
      'edit_election',
      'delete_election',
      'manage_candidates',
      'manage_voters',
      'start_election',
      'pause_election',
      'extend_election',
      'publish_results',
      'view_results',
      'audit_system',
      'manage_admins'
    ]
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date
  },
  twoFactorSecret: {
    type: String,
    select: false
  },
  isTwoFactorEnabled: {
    type: Boolean,
    default: false
  },
  department: {
    type: String,
    trim: true
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Administrator'
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

administratorSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

administratorSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

administratorSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

administratorSchema.methods.hasPermission = function(permission) {
  return this.permissions.includes(permission);
};

administratorSchema.methods.canManageElections = function() {
  return this.hasPermission('create_election') || 
         this.hasPermission('edit_election') || 
         this.hasPermission('delete_election');
};

administratorSchema.methods.canManageVoters = function() {
  return this.hasPermission('manage_voters') || 
         this.role === 'voter_registry_admin';
};

administratorSchema.methods.canAudit = function() {
  return this.hasPermission('audit_system') || 
         this.role === 'auditor';
};

administratorSchema.index({ role: 1 });

module.exports = mongoose.model('Administrator', administratorSchema);
