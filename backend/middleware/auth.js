const jwt = require('jsonwebtoken');
const Voter = require('../Models/voterModel');
const Administrator = require('../Models/administratorModel');
const { generateTwoFactorSecret, verifyTwoFactorToken } = require('../utils/authUtils');

const protect = async (req, res, next) => {
  try {
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      return res.status(401).json({
        status: 'fail',
        message: 'You are not logged in! Please log in to get access.'
      });
    }
    
    const { getJwtSecret } = require('../utils/authUtils');
    const decoded = jwt.verify(token, getJwtSecret());
    
    const User = require('../Models/userModel');
    let user = await User.findById(decoded.id);

    if (!user) {
      user = await Voter.findById(decoded.id);
    }
    if (!user) {
      user = await Administrator.findById(decoded.id);
    }
    
    if (!user) {
      return res.status(401).json({
        status: 'fail',
        message: 'The user belonging to this token no longer exists.'
      });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      status: 'fail',
      message: 'Invalid token'
    });
  }
};

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'fail',
        message: 'You do not have permission to perform this action'
      });
    }
    next();
  };
};

const requireTwoFactor = async (req, res, next) => {
  try {
    const { twoFactorToken } = req.body;
    
    if (!req.user.isTwoFactorEnabled) {
      return next();
    }
    
    if (!twoFactorToken) {
      return res.status(400).json({
        status: 'fail',
        message: 'Two-factor authentication token is required'
      });
    }
    
    const isValid = verifyTwoFactorToken(twoFactorToken, req.user.twoFactorSecret);
    
    if (!isValid) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid two-factor authentication token'
      });
    }
    
    next();
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Error verifying two-factor authentication'
    });
  }
};

const checkVoteEligibility = async (req, res, next) => {
  try {
    const { electionId } = req.params;
    const Election = require('../Models/electionModel');
    
    const election = await Election.findById(electionId);
    
    if (!election) {
      return res.status(404).json({
        status: 'fail',
        message: 'Election not found'
      });
    }
    
    if (!election.isActive()) {
      return res.status(400).json({
        status: 'fail',
        message: 'Election is not currently active'
      });
    }
    
    const Vote = require('../Models/voteModel');
    const existingVote = await Vote.findOne({ voter: req.user._id, election: electionId });
    if (existingVote) {
      return res.status(400).json({
        status: 'fail',
        message: 'You have already voted in this election'
      });
    }
    
    const isEligible = await election.canVote(req.user._id);
    
    if (!isEligible) {
      return res.status(403).json({
        status: 'fail',
        message: 'You are not eligible to vote in this election'
      });
    }
    
    req.election = election;
    next();
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Error checking vote eligibility'
    });
  }
};

const rateLimitByIP = (maxRequests = 5, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();
  // Optional global override so load/benchmark runs can lift the auth limit.
  // Unset -> keep the per-route default (production behaviour unchanged).
  const envMax = Number(process.env.AUTH_RATE_LIMIT_MAX);
  const effectiveMax = Number.isFinite(envMax) && envMax > 0 ? envMax : maxRequests;

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!requests.has(ip)) {
      requests.set(ip, []);
    }

    const ipRequests = requests.get(ip).filter(timestamp => timestamp > windowStart);

    if (ipRequests.length >= effectiveMax) {
      return res.status(429).json({
        status: 'fail',
        message: 'Too many requests from this IP, please try again later.'
      });
    }
    
    ipRequests.push(now);
    requests.set(ip, ipRequests);
    
    next();
  };
};

const validateBiometric = async (req, res, next) => {
  try {
    const { biometricData, biometricType } = req.body;
    
    if (!biometricData || !biometricType) {
      return res.status(400).json({
        status: 'fail',
        message: 'Biometric data and type are required'
      });
    }
    
    const { generateBiometricHash } = require('../utils/authUtils');
    const providedHash = generateBiometricHash(biometricData);
    
    let storedHash;
    if (biometricType === 'fingerprint') {
      storedHash = req.user.biometricData?.fingerprintHash;
    } else if (biometricType === 'facial') {
      storedHash = req.user.biometricData?.facialRecognitionHash;
    }
    
    if (!storedHash || storedHash !== providedHash) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid biometric data'
      });
    }
    
    next();
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Error validating biometric data'
    });
  }
};

const restrictToVoter = (req, res, next) => {
  if (!req.user || req.user.role !== 'voter') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only registered voters can access voting endpoints'
    });
  }
  next();
};

const validateCastVoteBody = (req, res, next) => {
  const mongoose = require('mongoose');
  const { electionId, candidateId } = req.body;

  if (!electionId || !candidateId) {
    return res.status(400).json({
      status: 'fail',
      message: 'Election ID and candidate ID are required'
    });
  }

  if (
    !mongoose.Types.ObjectId.isValid(electionId) ||
    !mongoose.Types.ObjectId.isValid(candidateId)
  ) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid election or candidate ID format'
    });
  }

  const allowedAuth = ['password', '2fa', 'biometric', 'multi_factor'];
  if (
    req.body.authenticationMethod &&
    !allowedAuth.includes(req.body.authenticationMethod)
  ) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid authentication method'
    });
  }

  next();
};

const auditLog = (eventType, action, description) => {
  return async (req, res, next) => {
    try {
      if (!req.user?._id) {
        return next();
      }

      const AuditLog = require('../Models/auditLogModel');
      const body = req.body || {};

      const details = {
        metadata: {
          method: req.method,
          url: req.originalUrl,
          timestamp: new Date()
        }
      };

      const electionId =
        req.election?._id || req.params?.electionId || body.electionId;
      if (electionId) {
        details.electionId = electionId;
      }
      if (body.candidateId) {
        details.candidateId = body.candidateId;
      }

      await AuditLog.create({
        eventType,
        userId: req.user._id,
        userModel: req.user.constructor.modelName || 'User',
        action,
        description,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.get('User-Agent'),
        details
      });

      next();
    } catch (error) {
      console.error('Audit log error:', error);
      next();
    }
  };
};

module.exports = {
  protect,
  restrictTo,
  restrictToVoter,
  requireTwoFactor,
  checkVoteEligibility,
  validateCastVoteBody,
  rateLimitByIP,
  validateBiometric,
  auditLog
};
