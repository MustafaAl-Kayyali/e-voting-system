const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Election = require('./Models/electionModel');
const Candidate = require('./Models/candidateModel');
const Voter = require('./Models/voterModel');

dotenv.config({ path: './.env' });

async function debugData() {
  try {
    const db = process.env.DATABASE.replace('<PASSWORD>', encodeURIComponent(process.env.DATABASE_PASSWORD));
    await mongoose.connect(db);
    console.log('Connected to MongoDB');

    const elections = await Election.find().sort({ createdAt: -1 }).limit(10);
    for (const election of elections) {
        console.log(`\nElection: "${election.title}"`);
        console.log(`Districts: ${JSON.stringify(election.electoralDistricts.map(d => d.name))}`);
        
        const candidates = await Candidate.find({ _id: { $in: election.candidates } });
        console.log(`Candidates Found: ${candidates.length}`);
        candidates.forEach(c => {
            console.log(`- ${c.firstName} ${c.lastName} | District: "${c.electoralDistrict}"`);
        });
    }

    const mustafa = await Voter.findOne({ email: 'mustafaalkayyali80@gmail.com' });
    if (mustafa) {
        console.log(`\nVoter Mustafa: "${mustafa.firstName}" | District: "${mustafa.electoralDistrict}"`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

debugData();
