const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

const { startVoteWorker } = require('./worker/voteWorker');

startVoteWorker().catch((err) => {
  console.error('Vote worker failed to start:', err);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  const { stopVoteWorker } = require('./worker/voteWorker');
  await stopVoteWorker();
  process.exit(0);
});
