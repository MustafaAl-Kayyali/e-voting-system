const crypto = require('crypto');
const { getRedisClient, isDistributedVotingEnabled } = require('../config/redis');

const TTL_SECONDS = 3600;

const buildCacheKey = (voterId, idempotencyKey) =>
  `idempotency:${voterId}:${idempotencyKey}`;

const idempotency = async (req, res, next) => {
  if (!isDistributedVotingEnabled() || req.method !== 'POST') {
    return next();
  }

  let key = req.get('Idempotency-Key');
  if (!key) {
    const { electionId, candidateId } = req.body || {};
    if (electionId && candidateId && req.user?._id) {
      key = crypto
        .createHash('sha256')
        .update(`${req.user._id}:${electionId}:${candidateId}`)
        .digest('hex')
        .slice(0, 32);
    } else {
      return next();
    }
  }

  if (key.length > 128) {
    return res.status(400).json({
      status: 'fail',
      message: 'Idempotency-Key is too long'
    });
  }

  const redis = getRedisClient();
  const cacheKey = buildCacheKey(req.user._id, key);

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const payload = JSON.parse(cached);
      return res.status(payload.statusCode).json(payload.body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 500) {
        redis
          .setex(
            cacheKey,
            TTL_SECONDS,
            JSON.stringify({ statusCode: res.statusCode, body })
          )
          .catch((err) => console.error('Idempotency cache write failed:', err));
      }
      return originalJson(body);
    };

    req.idempotencyKey = key;
    next();
  } catch (err) {
    console.error('Idempotency middleware error:', err);
    next();
  }
};

module.exports = idempotency;
