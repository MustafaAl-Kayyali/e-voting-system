const mongoose = require('mongoose');
const Election = require('./Models/electionModel');
const Voter = require('./Models/voterModel');
const User = require('./Models/userModel');
const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

async function fixData() {
  try {
    const dbUri = process.env.DATABASE.replace('<PASSWORD>', encodeURIComponent(process.env.DATABASE_PASSWORD));
    await mongoose.connect(dbUri);
    console.log('Connected to DB');
    
    // 1. Reset all elections to active
    const result = await Election.updateMany({}, { status: 'active' });
    console.log('Elections updated to active:', result.modifiedCount);

    // 2. Find Mustafa and ensure he has an electoralDistrict and is in the Voter model
    const user = await User.findOne({ email: 'mustafaalkayyali80@gmail.com' });
    if (user) {
        console.log('Found user Mustafa');
        await Voter.deleteOne({ email: user.email }); // Clear any existing
        
        console.log('Creating Voter record for Mustafa with synced ID...');
        await Voter.create({
            _id: user._id,
            nationalId: '1234567890',
            firstName: 'Mustafa',
            lastName: 'Al-Kayyali',
            email: user.email,
            password: user.password,
            dateOfBirth: new Date('2000-01-01'),
            electoralDistrict: 'Main Office',
            isVerified: true,
            isWhitelisted: true
        });
        console.log('Voter record created/synced');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

fixData();
