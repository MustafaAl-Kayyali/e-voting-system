const mongoose = require('mongoose');
const Voter = require('./Models/voterModel');
const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

async function checkVoter() {
  try {
    const dbUri = process.env.DATABASE.replace('<PASSWORD>', encodeURIComponent(process.env.DATABASE_PASSWORD));
    await mongoose.connect(dbUri);
    console.log('Connected to DB');
    
    const voters = await Voter.find();
    console.log('Total Voters:', voters.length);
    voters.forEach(v => {
      console.log(`- ${v.firstName} ${v.lastName} | Email: ${v.email} | District: "${v.electoralDistrict}" | Role: ${v.role}`);
    });
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkVoter();
