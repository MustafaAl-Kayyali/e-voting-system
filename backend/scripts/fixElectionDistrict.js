const dotenv = require('dotenv');
const mongoose = require('mongoose');
const Election = require('../Models/electionModel');
const Candidate = require('../Models/candidateModel');

dotenv.config({ path: './.env' });

const normalize = (value) => String(value || '').trim().toLowerCase();

async function run() {
  const targetDistrict = process.env.TARGET_DISTRICT || process.argv[2] || 'Barcelona';
  const electionTitle = process.env.ELECTION_TITLE || process.argv.slice(3).join(' ');
  const uri = process.env.DATABASE || process.env.DATABASE_LOCAL;

  if (!uri) {
    throw new Error('DATABASE or DATABASE_LOCAL must be set in .env');
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10000
  });

  const filter = electionTitle
    ? { title: { $regex: electionTitle, $options: 'i' } }
    : { status: { $in: ['draft', 'active', 'paused'] } };

  const elections = await Election.find(filter);
  if (!elections.length) {
    console.log('No elections matched the selected filter.');
    return;
  }

  for (const election of elections) {
    const previousDistricts = election.electoralDistricts.map((district) => district.name);

    if (!election.electoralDistricts.length) {
      election.electoralDistricts.push({ name: targetDistrict, eligibleVoters: [] });
    } else {
      election.electoralDistricts = election.electoralDistricts.map((district) => ({
        ...district.toObject?.() || district,
        name: targetDistrict
      }));
    }

    election.updatedAt = new Date();
    await election.save();

    const candidateUpdate = await Candidate.updateMany(
      { _id: { $in: election.candidates } },
      { $set: { electoralDistrict: targetDistrict, status: 'approved', isApproved: true } }
    );

    console.log(`Updated election: ${election.title}`);
    console.log(`  Districts: ${previousDistricts.join(', ') || '(none)'} -> ${targetDistrict}`);
    console.log(`  Candidates updated: ${candidateUpdate.modifiedCount}`);
  }
}

run()
  .catch((error) => {
    console.error('District fix failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
