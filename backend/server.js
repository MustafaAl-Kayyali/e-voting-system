const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

const { connectDatabase } = require('./config/database');

async function startApiServer() {
  try {
    const redisEnabled =
      process.env.DISTRIBUTED_VOTING === 'true' &&
      Boolean(process.env.REDIS_URL);

    if (redisEnabled) {
      const { initRedis } = require('./config/redis');
      await initRedis();
      console.log('Redis connected: distributed voting enabled');
    } else {
      console.log('Redis disabled: running in local single-node mode');
    }

    await connectDatabase();

    const app = require('./app');
    const port = process.env.PORT || 3000;
    const instanceId = process.env.INSTANCE_ID || 'local';

    app.listen(port, () => {
      console.log(`API [${instanceId}] running on port ${port}`);

      if (redisEnabled) {
        console.log('Distributed mode: Redis + vote queue enabled');
      } else {
        console.log('Local mode: votes will be processed directly');
      }
    });
  } catch (err) {
    console.error('Failed to start API server:', err.message);
    process.exit(1);
  }
}

startApiServer();