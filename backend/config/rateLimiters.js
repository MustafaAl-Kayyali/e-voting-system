const rateLimit = require('express-rate-limit');
const { createRateLimitStore } = require('./redis');

function buildLimiter(prefix, options) {
  // Each limiter gets its own RedisStore instance with a unique prefix
  // (express-rate-limit v8 forbids sharing a single store across limiters).
  const store = createRateLimitStore(prefix);
  return rateLimit({
    ...options,
    ...(store ? { store } : {})
  });
}

// Limits are env-configurable so load/benchmark runs can raise them.
// Defaults preserve the original production behaviour (100 global / 10 votes per 15 min per IP).
const GLOBAL_MAX = Number(process.env.RATE_LIMIT_GLOBAL_MAX) || 100;
const VOTE_MAX = Number(process.env.RATE_LIMIT_VOTE_MAX) || 10;

const globalLimiter = () =>
  buildLimiter('rl:global:', {
    windowMs: 15 * 60 * 1000,
    max: GLOBAL_MAX,
    message: {
      status: 'fail',
      message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
  });

const voteCastLimiter = () =>
  buildLimiter('rl:vote:', {
    windowMs: 15 * 60 * 1000,
    max: VOTE_MAX,
    message: {
      status: 'fail',
      message: 'Too many vote attempts from this IP. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
  });

module.exports = {
  globalLimiter,
  voteCastLimiter
};
