const Redis = require('ioredis');

let client = null;
let rateLimitStore = null;

const isDistributedVotingEnabled = () =>
  process.env.DISTRIBUTED_VOTING === 'true' && Boolean(process.env.REDIS_URL);

const isRedisConfigured = isDistributedVotingEnabled;

const parseRedisUrl = (url) => {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    password: parsed.password || undefined,
    maxRetriesPerRequest: null
  };
};

async function initRedis() {
  if (!isRedisConfigured()) {
    return null;
  }

  if (client) {
    return client;
  }

  client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true
  });

  await new Promise((resolve, reject) => {
    client.once('ready', resolve);
    client.once('error', reject);
  });

  try {
    // Mark that redis-backed rate limiting is available; individual limiters
    // build their own store (with a unique prefix) via createRateLimitStore().
    rateLimitStore = true;
  } catch (err) {
    console.warn('rate-limit-redis not available, using in-memory rate limits:', err.message);
  }

  return client;
}

// Build a fresh RedisStore bound to the shared client, with a unique prefix.
// express-rate-limit v8 forbids sharing one store across limiters.
function createRateLimitStore(prefix) {
  if (!client) return undefined;
  try {
    const { RedisStore } = require('rate-limit-redis');
    return new RedisStore({
      sendCommand: (...args) => client.call(...args),
      prefix: prefix || 'rl:'
    });
  } catch (err) {
    console.warn('rate-limit-redis not available, using in-memory rate limits:', err.message);
    return undefined;
  }
}

function getRedisClient() {
  return client;
}

function getRateLimitStore() {
  return rateLimitStore;
}

function getBullConnection() {
  if (!isRedisConfigured()) {
    return null;
  }
  return parseRedisUrl(process.env.REDIS_URL);
}

async function closeRedis() {
  if (client) {
    await client.quit();
    client = null;
    rateLimitStore = null;
  }
}

module.exports = {
  initRedis,
  closeRedis,
  getRedisClient,
  getRateLimitStore,
  createRateLimitStore,
  getBullConnection,
  isRedisConfigured,
  isDistributedVotingEnabled
};
