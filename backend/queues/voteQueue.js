const { Queue } = require('bullmq');
const { getBullConnection, isDistributedVotingEnabled } = require('../config/redis');

const QUEUE_NAME = 'vote-cast';

let voteQueue = null;

function getVoteQueue() {
  if (!isDistributedVotingEnabled()) {
    return null;
  }

  if (!voteQueue) {
    voteQueue = new Queue(QUEUE_NAME, {
      connection: getBullConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 }
      }
    });
  }

  return voteQueue;
}

module.exports = {
  QUEUE_NAME,
  getVoteQueue
};
