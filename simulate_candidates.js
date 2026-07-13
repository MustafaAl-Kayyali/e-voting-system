const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Election = require('./backend/Models/electionModel');
const Candidate = require('./backend/Models/candidateModel');
const Voter = require('./backend/Models/voterModel');

dotenv.config({ path: './backend/.env' });

async function simulateGetCandidates() {
  try {
    const db = process.env.DATABASE.replace('<PASSWORD>', encodeURIComponent(process.env.DATABASE_PASSWORD));
    await mongoose.connect(db);
    console.log('Connected to MongoDB');

    // 1. Get an election with candidates
    const election = await Election.findOne({ title: 'dfghjkl;' })
      .populate('candidates', 'firstName lastName party position biography photo electoralDistrict')
      .select('title electoralDistricts status startDate endDate');

    if (!election) {
        console.log('Election not found');
        process.exit(1);
    }

    console.log(`\nElection: "${election.title}"`);
    console.log(`Status: ${election.status}`);
    console.log(`IsActive: ${election.isActive()}`);
    console.log(`Candidates in DB: ${election.candidates.length}`);

    // 2. Get Mustafa
    const voter = await Voter.findOne({ email: 'mustafaalkayyali80@gmail.com' });
    if (!voter) {
        console.log('Voter not found');
        process.exit(1);
    }

    const voterDistrict = voter.electoralDistrict;
    console.log(`Voter District: "${voterDistrict}"`);

    // 3. Simulate filtering logic
    const eligibleCandidates = election.candidates.filter(candidate => {
      console.log(`Checking candidate: ${candidate.firstName}, District: "${candidate.electoralDistrict}"`);
      if (!candidate.electoralDistrict || !voterDistrict) return false;
      return candidate.electoralDistrict.trim().toLowerCase() === voterDistrict.trim().toLowerCase();
    });

    console.log(`Eligible Candidates found: ${eligibleCandidates.length}`);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

simulateGetCandidates();
