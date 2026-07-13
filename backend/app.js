const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { globalLimiter } = require('./config/rateLimiters');
const { isDistributedVotingEnabled, isRedisConfigured } = require('./config/redis');

const authRoutes = require('./routes/authRoutes');
const votingRoutes = require('./routes/votingRoutes');
const adminRoutes = require('./routes/adminRoutes');
const candidateRoutes = require('./routes/candidateRoutes');
const voterRegistryRoutes = require('./routes/voterRegistryRoutes');
const auditorRoutes = require('./routes/auditorRoutes');
const userRoutes = require('./routes/userRouter');

const app = express();

// Behind the Nginx load balancer (one hop): trust the proxy so req.ip and
// express-rate-limit use the real client IP from X-Forwarded-For.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(globalLimiter());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  req.body = req.body || {};
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/voting', votingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/voter-registry', voterRegistryRoutes);
app.use('/api/audit', auditorRoutes);
app.use('/api/users', userRoutes);

app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'E-Voting System API is running',
    version: '1.1.0-distributed',
    endpoints: {
      auth: '/api/auth',
      voting: '/api/voting',
      admin: '/api/admin',
      candidates: '/api/candidates',
      voterRegistry: '/api/voter-registry',
      audit: '/api/audit'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'success',
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    instanceId: process.env.INSTANCE_ID || 'local',
    distributed: {
      redis: isRedisConfigured(),
      votingQueue: isDistributedVotingEnabled()
    }
  });
});

app.use((req, res, next) => {
  const err = new Error(`Can't find ${req.originalUrl} on this server!`);
  err.status = 404;
  err.statusCode = 404;
  next(err);
});

app.use((err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  } else {
    if (err.isOperational) {
      res.status(err.statusCode).json({
        status: err.status,
        message: err.message
      });
    } else {
      console.error('ERROR ', err);
      res.status(500).json({
        status: 'error',
        message: 'Something went wrong!'
      });
    }
  }
});

module.exports = app;