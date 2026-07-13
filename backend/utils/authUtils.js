const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const jwt = require('jsonwebtoken');

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return secret || 'fallback_secret_dev_only';
};

const generateToken = (id) => {
  return jwt.sign({ id }, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRE || '24h'
  });
};

const generateTwoFactorSecret = (userEmail) => {
  return speakeasy.generateSecret({
    name: `E-Voting System (${userEmail})`,
    issuer: 'E-Voting System',
    length: 32
  });
};

const verifyTwoFactorToken = (token, secret) => {
  return speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: token,
    window: 2,
    time: Date.now()
  });
};

const generateQRCode = async (secret) => {
  try {
    const otpauthUrl = speakeasy.otpauthURL({
      secret: secret.base32,
      label: secret.name,
      issuer: secret.issuer
    });
    
    return await QRCode.toDataURL(otpauthUrl);
  } catch (error) {
    throw new Error('Failed to generate QR code');
  }
};

const generateSecureHash = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

const generateEncryptedReceipt = (voterId, electionId, candidateId) => {
  const timestamp = Date.now();
  const data = `${voterId}_${electionId}_${candidateId}_${timestamp}`;
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  const receiptId = crypto.createHash('md5').update(data).digest('hex');
  
  return {
    receiptId,
    hash,
    timestamp
  };
};

const createBlockchainHash = (voteData) => {
  const dataString = JSON.stringify(voteData);
  return crypto.createHash('sha256').update(dataString).digest('hex');
};

const verifyVoteIntegrity = (voteData, storedHash) => {
  const computedHash = createBlockchainHash(voteData);
  return computedHash === storedHash;
};

const generateBiometricHash = (biometricData) => {
  return crypto.createHash('sha256').update(biometricData).digest('hex');
};

const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .trim()
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '');
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  return {
    isValid: password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar,
    errors: [
      password.length < minLength ? 'Password must be at least 8 characters long' : null,
      !hasUpperCase ? 'Password must contain at least one uppercase letter' : null,
      !hasLowerCase ? 'Password must contain at least one lowercase letter' : null,
      !hasNumbers ? 'Password must contain at least one number' : null,
      !hasSpecialChar ? 'Password must contain at least one special character' : null
    ].filter(error => error !== null)
  };
};

const generateSessionToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const encryptSensitiveData = (data, key = process.env.ENCRYPTION_KEY || 'default_secret_key_needs_to_be_32_bytes_long') => {
  const algorithm = 'aes-256-cbc';
  const iv = crypto.randomBytes(16);
  // Ensure key is exactly 32 bytes for aes-256
  const keyBuffer = crypto.createHash('sha256').update(key).digest();
  const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
};

const decryptSensitiveData = (encryptedData, key = process.env.ENCRYPTION_KEY || 'default_secret_key_needs_to_be_32_bytes_long') => {
  const algorithm = 'aes-256-cbc';
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  
  const keyBuffer = crypto.createHash('sha256').update(key).digest();
  const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};

module.exports = {
  getJwtSecret,
  generateToken,
  generateTwoFactorSecret,
  verifyTwoFactorToken,
  generateQRCode,
  generateSecureHash,
  generateEncryptedReceipt,
  createBlockchainHash,
  verifyVoteIntegrity,
  generateBiometricHash,
  sanitizeInput,
  validateEmail,
  validatePassword,
  generateSessionToken,
  encryptSensitiveData,
  decryptSensitiveData
};
