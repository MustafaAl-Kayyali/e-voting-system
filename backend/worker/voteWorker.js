const { Worker } = require('bullmq');
const { connectDatabase } = require('../config/database');
const { initRedis, getBullConnection, closeRedis } = require('../config/redis');
const { QUEUE_NAME } = require('../queues/voteQueue');
const { castVoteAtomic, VoteCastError } = require('../services/voteCastService');
const { serializeCastVoteResult } = require('../services/voteResultSerializer');

let worker = null;

async function startVoteWorker() {
  await initRedis();
  await connectDatabase();

  const connection = getBullConnection();
  if (!connection) {
    throw new Error('REDIS_URL is required to run the vote worker');
  }

  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      try {
        const result = await castVoteAtomic({
          voterId: job.data.voterId,
          electionId: job.data.electionId,
          candidateId: job.data.candidateId,
          authenticationMethod: job.data.authenticationMethod,
          ipAddress: job.data.ipAddress,
          userAgent: job.data.userAgent
        });
        return serializeCastVoteResult(result);
      } catch (err) {
        if (err instanceof VoteCastError) {
          const wrapped = new Error(err.message);
          wrapped.name = 'VoteCastError';
          wrapped.code = err.code;
          wrapped.statusCode = err.statusCode;
          throw wrapped;
        }
        throw err;
      }
    },
    {
      connection,
      concurrency: Number(process.env.VOTE_WORKER_CONCURRENCY || 5)
    }
  );

  worker.on('completed', (job) => {
    console.log(`[worker] Vote job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[worker] Vote job ${job?.id} failed:`, err.message);
  });

  console.log(`Vote worker listening on queue "${QUEUE_NAME}"`);
  return worker;
}

async function stopVoteWorker() {
  if (worker) {
    await worker.close();
    worker = null;
  }
  await closeRedis();
}

module.exports = {
  startVoteWorker,
  stopVoteWorker
};
