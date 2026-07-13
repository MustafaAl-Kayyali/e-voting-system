const mongoose = require('mongoose');
const Election = require('./Models/electionModel');
const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

async function listElections() {
  try {
    const dbUri = process.env.DATABASE.replace('<PASSWORD>', encodeURIComponent(process.env.DATABASE_PASSWORD));
    await mongoose.connect(dbUri);
    console.log('Connected to DB');
    
    const elections = await Election.find();
    console.log('Total Elections:', elections.length);
    elections.forEach(e => {
      console.log(`- [${e.status}] ${e.title} (${e.type}) | Start: ${e.startDate} | End: ${e.endDate}`);
      console.log(`  Districts: ${JSON.stringify(e.electoralDistricts.map(d => d.name))}`);
    });
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

listElections();
