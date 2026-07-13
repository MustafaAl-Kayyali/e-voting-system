const mongoose = require('mongoose');
const User = require('./Models/userModel');
const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

async function checkUsers() {
  try {
    const dbUri = process.env.DATABASE.replace('<PASSWORD>', encodeURIComponent(process.env.DATABASE_PASSWORD));
    await mongoose.connect(dbUri);
    console.log('Connected to DB');
    
    const users = await User.find();
    console.log('Total Users:', users.length);
    users.forEach(u => {
      console.log(`- ${u.name} | Email: ${u.email} | Role: ${u.role}`);
    });
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkUsers();
