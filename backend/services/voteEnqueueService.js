const { getVoteQueue } = require('../queues/voteQueue');
const { acquireVoteLock } = require('./voteLockService');
const { VoteCastError } = require('./voteCastService');

async function enqueueCastVote(payload) {
  const queue = getVoteQueue();
  if (!queue) {
    throw new VoteCastError('Distributed voting is not enabled', 503, 'QUEUE_UNAVAILABLE');
  }

  const lock = await acquireVoteLock(payload.voterId, payload.electionId);
  if (!lock.acquired) {
    throw new VoteCastError(
      'A vote for this election is already being processed',
      409,
      'VOTE_IN_PROGRESS'
    );
  }

  const jobId = `vote:${payload.voterId}:${payload.electionId}`;

  try {
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'completed' || state === 'active' || state === 'waiting' || state === 'delayed') {
        return existing;
      }
    }

    return await queue.add('cast', payload, {
      jobId,
      // Keep completed jobs briefly so the client can poll the result
      // (GET /vote/jobs/:jobId). Removing on complete immediately would make
      // every poll 404 even though the vote was cast successfully.
      removeOnComplete: { age: 300, count: 1000 },
      removeOnFail: false
    });
  } catch (err) {
    const existing = await queue.getJob(jobId);
    if (existing) {
      return existing;
    }
    throw err;
  } finally {
    await lock.release();
  }
}

module.exports = {
  enqueueCastVote
};
