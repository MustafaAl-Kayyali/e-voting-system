const mongoose = require('mongoose');

let connected = false;

async function connectDatabase() {
  if (connected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const localDB = process.env.DATABASE_LOCAL;
  const cloudDB = process.env.DATABASE;
  const password = process.env.DATABASE_PASSWORD
    ? encodeURIComponent(process.env.DATABASE_PASSWORD)
    : '';

  const uri = cloudDB
    ? cloudDB.replace('<PASSWORD>', password)
    : localDB;

  if (!uri) {
    throw new Error('DATABASE or DATABASE_LOCAL must be set');
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10000
  });
  connected = true;
  console.log('DB connection successful!');
  return mongoose.connection;
}

module.exports = {
  connectDatabase
};
