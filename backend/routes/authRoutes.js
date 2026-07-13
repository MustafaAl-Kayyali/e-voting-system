const express = require('express');
const { 
  signupVoter, 
  signupAdmin,
  loginVoter, 
  enableTwoFactor, 
  verifyAndEnableTwoFactor, 
  loginAdmin 
} = require('../Controllers/authController');
const { protect, rateLimitByIP } = require('../middleware/auth');

const router = express.Router();

router.post('/signup/voter', 
  rateLimitByIP(3, 15 * 60 * 1000),
  signupVoter
);

router.post('/signup/admin', 
  rateLimitByIP(3, 15 * 60 * 1000),
  signupAdmin
);

router.post('/login/voter', 
  rateLimitByIP(5, 15 * 60 * 1000),
  loginVoter
);

router.post('/login/admin', 
  rateLimitByIP(5, 15 * 60 * 1000),
  loginAdmin
);

router.post('/enable-2fa', 
  protect, 
  enableTwoFactor
);

router.post('/verify-2fa', 
  protect, 
  verifyAndEnableTwoFactor
);

module.exports = router;
