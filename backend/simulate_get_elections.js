const mongoose = require('mongoose');
const Election = require('./Models/electionModel');
const Voter = require('./Models/voterModel');
const User = require('./Models/userModel');
const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

async function simulate() {
  try {
    const dbUri = process.env.DATABASE.replace('<PASSWORD>', encodeURIComponent(process.env.DATABASE_PASSWORD));
    await mongoose.connect(dbUri);
    console.log('Connected to DB');
    
    const user = await User.findOne({ email: 'mustafaalkayyali80@gmail.com' });
    console.log('User ID:', user._id);

    const elections = await Election.find({ status: 'active' });
    console.log('Active Elections found:', elections.length);

    for (const election of elections) {
        console.log(`Checking election: ${election.title}`);
        const canVote = await election.canVote(user._id);
        console.log(`Can Vote Result for Mustafa: ${canVote}`);
        
        // Debug internal logic of canVote
        const voter = await Voter.findById(user._id);
        console.log(`Voter found: ${voter ? 'Yes' : 'No'}`);
        if (voter) {
            console.log(`Voter District: "${voter.electoralDistrict}"`);
            const voterDistrict = election.electoralDistricts.find(d => 
                d.name.toLowerCase() === voter.electoralDistrict.toLowerCase()
            );
            console.log(`Matching District found in election: ${voterDistrict ? 'Yes' : 'No'}`);
        }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

simulate();
