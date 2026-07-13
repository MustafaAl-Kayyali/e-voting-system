const Voter = require('../Models/voterModel');
const Administrator = require('../Models/administratorModel');
const AuditLog = require('../Models/auditLogModel');
const { 
  generateToken, 
  generateTwoFactorSecret, 
  verifyTwoFactorToken, 
  generateQRCode,
  validateEmail,
  validatePassword,
  sanitizeInput
} = require('../utils/authUtils');

const signupVoter = async (req, res) => {
  try {
    const body = req.body || {};
    const nationalId = body.nationalId || body.id;
    const {
      firstName,
      lastName,
      email,
      phoneNumber,
      dateOfBirth,
      electoralDistrict,
      password
    } = body;

    if (
      !nationalId ||
      !firstName ||
      !lastName ||
      !email ||
      !dateOfBirth ||
      !electoralDistrict ||
      !password
    ) {
      return res.status(400).json({
        status: 'fail',
        message: 'All required registration fields must be provided'
      });
    }

    const sanitizedData = {
      nationalId: sanitizeInput(nationalId),
      firstName: sanitizeInput(firstName),
      lastName: sanitizeInput(lastName),
      email: sanitizeInput(email),
      phoneNumber: sanitizeInput(phoneNumber),
      electoralDistrict: sanitizeInput(electoralDistrict)
    };

    if (!validateEmail(sanitizedData.email)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide a valid email address'
      });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        status: 'fail',
        message: 'Password does not meet requirements',
        errors: passwordValidation.errors
      });
    }

    const existingVoter = await Voter.findOne({
      $or: [{ email: sanitizedData.email }, { nationalId: sanitizedData.nationalId }]
    });

    if (existingVoter) {
      return res.status(400).json({
        status: 'fail',
        message: 'A voter with this email or national ID already exists'
      });
    }

    const newVoter = await Voter.create({
      ...sanitizedData,
      dateOfBirth: new Date(dateOfBirth),
      password
    });

    await AuditLog.create({
      eventType: 'voter_registered',
      userId: newVoter._id,
      userModel: 'Voter',
      action: 'voter_registration',
      description: `New voter ${newVoter.firstName} ${newVoter.lastName} registered`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.get('User-Agent'),
      severity: 'medium',
      category: 'authentication'
    });

    const token = generateToken(newVoter._id);

    res.status(201).json({
      status: 'success',
      message: 'Voter registered successfully',
      data: {
        voter: {
          id: newVoter._id,
          firstName: newVoter.firstName,
          lastName: newVoter.lastName,
          email: newVoter.email,
          nationalId: newVoter.nationalId,
          electoralDistrict: newVoter.electoralDistrict,
          role: newVoter.role || 'voter',
          isVerified: newVoter.isVerified,
          isTwoFactorEnabled: newVoter.isTwoFactorEnabled
        },
        token
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error registering voter',
      error: error.message
    });
  }
};

const {
  resolveVoterLoginQuery,
  resolveAdminLoginQuery
} = require('../utils/authLoginHelpers');

const loginVoter = async (req, res) => {
  try {
    const body = req.body || {};
    const nationalId = body.nationalId || body.id || body.identifier;
    const { password, twoFactorToken } = body;

    if (!nationalId || !password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide your ID and password'
      });
    }

    const voter = await Voter.findOne(resolveVoterLoginQuery(nationalId)).select(
      '+password +twoFactorSecret +loginAttempts +lockUntil'
    );

    if (!voter || !(await voter.correctPassword(password, voter.password))) {
      if (voter) {
        voter.loginAttempts += 1;
        if (voter.loginAttempts >= 5) {
          voter.lockUntil = Date.now() + 2 * 60 * 60 * 1000;
        }
        await voter.save();
      }

      await AuditLog.create({
        eventType: 'user_login',
        userId: voter?._id || null,
        userModel: 'Voter',
        action: 'login_failed',
        description: `Failed login attempt for national ID: ${nationalId}`,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.get('User-Agent'),
        success: false,
        severity: 'high',
        category: 'security'
      });

      return res.status(401).json({
        status: 'fail',
        message: 'Incorrect ID or password'
      });
    }

    if (voter.isLocked) {
      return res.status(423).json({
        status: 'fail',
        message: 'Account is locked due to too many failed login attempts'
      });
    }

    if (voter.isTwoFactorEnabled && !twoFactorToken) {
      return res.status(200).json({
        status: 'success',
        message: 'Two-factor authentication token required',
        requiresTwoFactor: true,
        data: { requiresTwoFactor: true }
      });
    }

    if (voter.isTwoFactorEnabled && twoFactorToken) {
      const isValidToken = verifyTwoFactorToken(twoFactorToken, voter.twoFactorSecret);
      if (!isValidToken) {
        return res.status(401).json({
          status: 'fail',
          message: 'Invalid two-factor authentication token'
        });
      }
    }

    voter.loginAttempts = 0;
    voter.lockUntil = undefined;
    voter.lastLogin = new Date();
    await voter.save();

    await AuditLog.create({
      eventType: 'user_login',
      userId: voter._id,
      userModel: 'Voter',
      action: 'login_success',
      description: `Voter ${voter.firstName} ${voter.lastName} logged in successfully`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.get('User-Agent'),
      success: true,
      severity: 'low',
      category: 'authentication'
    });

    const token = generateToken(voter._id);

    res.status(200).json({
      status: 'success',
      message: 'Login successful',
      data: {
        voter: {
          id: voter._id,
          firstName: voter.firstName,
          lastName: voter.lastName,
          email: voter.email,
          nationalId: voter.nationalId,
          electoralDistrict: voter.electoralDistrict,
          role: voter.role || 'voter',
          isVerified: voter.isVerified,
          isTwoFactorEnabled: voter.isTwoFactorEnabled,
          hasVoted: voter.hasVoted
        },
        token
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error during login',
      error: error.message
    });
  }
};

const enableTwoFactor = async (req, res) => {
  try {
    const voter = await Voter.findById(req.user._id).select('+twoFactorSecret');
    
    if (voter.isTwoFactorEnabled) {
      return res.status(400).json({
        status: 'fail',
        message: 'Two-factor authentication is already enabled'
      });
    }

    const secret = generateTwoFactorSecret(voter.email);
    const qrCode = await generateQRCode(secret);

    voter.twoFactorSecret = secret.base32;
    await voter.save();

    res.status(200).json({
      status: 'success',
      message: 'Two-factor authentication setup initiated',
      data: {
        secret: secret.base32,
        qrCode,
        backupCodes: []
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error setting up two-factor authentication',
      error: error.message
    });
  }
};

const verifyAndEnableTwoFactor = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        status: 'fail',
        message: 'Verification token is required'
      });
    }

    const voter = await Voter.findById(req.user._id).select('+twoFactorSecret');
    
    if (!voter.twoFactorSecret) {
      return res.status(400).json({
        status: 'fail',
        message: 'Two-factor setup not initiated'
      });
    }

    const isValidToken = verifyTwoFactorToken(token, voter.twoFactorSecret);
    
    if (!isValidToken) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid verification token'
      });
    }

    voter.isTwoFactorEnabled = true;
    await voter.save();

    await AuditLog.create({
      eventType: 'user_login',
      userId: voter._id,
      userModel: 'Voter',
      action: '2fa_enabled',
      description: `Two-factor authentication enabled for voter ${voter.firstName} ${voter.lastName}`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.get('User-Agent'),
      success: true,
      severity: 'medium',
      category: 'security'
    });

    res.status(200).json({
      status: 'success',
      message: 'Two-factor authentication enabled successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error enabling two-factor authentication',
      error: error.message
    });
  }
};

const loginAdmin = async (req, res) => {
  try {
    const body = req.body || {};
    const identifier = body.identifier || body.username || body.email;
    const { password, twoFactorToken } = body;

    if (!identifier || !password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide username or email and password'
      });
    }

    const admin = await Administrator.findOne(resolveAdminLoginQuery(identifier)).select(
      '+password +twoFactorSecret +loginAttempts +lockUntil'
    );

    if (!admin || !(await admin.correctPassword(password, admin.password))) {
      if (admin) {
        admin.loginAttempts += 1;
        if (admin.loginAttempts >= 5) {
          admin.lockUntil = Date.now() + 2 * 60 * 60 * 1000;
        }
        await admin.save();
      }

      await AuditLog.create({
        eventType: 'user_login',
        userId: admin?._id || null,
        userModel: 'Administrator',
        action: 'login_failed',
        description: `Failed login attempt for identifier: ${identifier}`,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.get('User-Agent'),
        success: false,
        severity: 'high',
        category: 'security'
      });

      return res.status(401).json({
        status: 'fail',
        message: 'Incorrect username, email, or password'
      });
    }

    if (admin.isLocked) {
      return res.status(423).json({
        status: 'fail',
        message: 'Account is locked due to too many failed login attempts'
      });
    }

    if (!admin.isActive) {
      return res.status(403).json({
        status: 'fail',
        message: 'Account is deactivated'
      });
    }

    if (admin.isTwoFactorEnabled && !twoFactorToken) {
      return res.status(200).json({
        status: 'success',
        message: 'Two-factor authentication token required',
        requiresTwoFactor: true,
        data: { requiresTwoFactor: true }
      });
    }

    if (admin.isTwoFactorEnabled && twoFactorToken) {
      const isValidToken = verifyTwoFactorToken(twoFactorToken, admin.twoFactorSecret);
      if (!isValidToken) {
        return res.status(401).json({
          status: 'fail',
          message: 'Invalid two-factor authentication token'
        });
      }
    }

    admin.loginAttempts = 0;
    admin.lockUntil = undefined;
    admin.lastLogin = new Date();
    await admin.save();

    await AuditLog.create({
      eventType: 'user_login',
      userId: admin._id,
      userModel: 'Administrator',
      action: 'login_success',
      description: `Administrator ${admin.firstName} ${admin.lastName} logged in successfully`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.get('User-Agent'),
      success: true,
      severity: 'low',
      category: 'authentication'
    });

    const token = generateToken(admin._id);

    res.status(200).json({
      status: 'success',
      message: 'Login successful',
      data: {
        admin: {
          id: admin._id,
          username: admin.username,
          firstName: admin.firstName,
          lastName: admin.lastName,
          role: admin.role,
          permissions: admin.permissions,
          isTwoFactorEnabled: admin.isTwoFactorEnabled
        },
        token
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error during admin login',
      error: error.message
    });
  }
};

const signupAdmin = async (req, res) => {
  try {
    const {
      username,
      firstName,
      lastName,
      email,
      password,
      role,
      department,
      phoneNumber
    } = req.body;

    const sanitizedData = {
      username: sanitizeInput(username),
      firstName: sanitizeInput(firstName),
      lastName: sanitizeInput(lastName),
      email: sanitizeInput(email),
      department: sanitizeInput(department),
      phoneNumber: sanitizeInput(phoneNumber)
    };

    if (!validateEmail(sanitizedData.email)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide a valid email address'
      });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        status: 'fail',
        message: 'Password does not meet requirements',
        errors: passwordValidation.errors
      });
    }

    const existingAdmin = await Administrator.findOne({
      $or: [{ email: sanitizedData.email }, { username: sanitizedData.username }]
    });

    if (existingAdmin) {
      return res.status(400).json({
        status: 'fail',
        message: 'An administrator with this email or username already exists'
      });
    }

    console.log('Registering Admin with data:', sanitizedData);
    
    const newAdmin = await Administrator.create({
      ...sanitizedData,
      password,
      role: role || 'election_admin',
      permissions: role === 'super_admin' ? [
        'create_election', 'edit_election', 'delete_election', 
        'manage_candidates', 'manage_voters', 'start_election', 
        'pause_election', 'extend_election', 'publish_results', 
        'view_results', 'audit_system', 'manage_admins'
      ] : ['create_election', 'edit_election', 'view_results', 'manage_candidates']
    });
    
    console.log('Admin created successfully:', newAdmin._id);

    /*
    await AuditLog.create({
      eventType: 'admin_registered',
      userId: newAdmin._id,
      userModel: 'Administrator',
      action: 'admin_registration',
      description: `New administrator ${newAdmin.username} registered`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.get('User-Agent'),
      severity: 'high',
      category: 'authentication'
    });
    */

    const token = generateToken(newAdmin._id);

    res.status(201).json({
      status: 'success',
      message: 'Administrator registered successfully',
      data: {
        admin: {
          id: newAdmin._id,
          username: newAdmin.username,
          firstName: newAdmin.firstName,
          lastName: newAdmin.lastName,
          email: newAdmin.email,
          role: newAdmin.role
        },
        token
      }
    });
  } catch (error) {
    console.error('Signup Admin Error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Error registering administrator',
      details: error.errors
    });
  }
};

module.exports = {
  signupVoter,
  signupAdmin,
  loginVoter,
  enableTwoFactor,
  verifyAndEnableTwoFactor,
  loginAdmin,
  resolveVoterLoginQuery,
  resolveAdminLoginQuery
};
