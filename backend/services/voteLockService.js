const { getRedisClient, isDistributedVotingEnabled } = require('../config/redis');

const LOCK_TTL_SECONDS = 30;

async function acquireVoteLock(voterId, electionId) {
  if (!isDistributedVotingEnabled()) {
    return { acquired: true, release: async () => {} };
  }

  const redis = getRedisClient();
  const key = `vote-lock:${voterId}:${electionId}`;
  const acquired = await redis.set(key, process.env.INSTANCE_ID || 'api', 'EX', LOCK_TTL_SECONDS, 'NX');

  if (acquired !== 'OK') {
    return { acquired: false, release: async () => {} };
  }

  return {
    acquired: true,
    release: async () => {
      await redis.del(key);
    }
  };
}

module.exports = {
  acquireVoteLock
};
