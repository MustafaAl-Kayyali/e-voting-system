const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./Models/userModel');
const bcrypt = require('bcryptjs');

dotenv.config({ path: './.env' });

const localDB = process.env.DATABASE_LOCAL;
const cloudDB = process.env.DATABASE;
const password = process.env.DATABASE_PASSWORD ? encodeURIComponent(process.env.DATABASE_PASSWORD) : '';
const DB = cloudDB ? cloudDB.replace('<PASSWORD>', password) : localDB;

async function createAdmin() {
  try {
    await mongoose.connect(DB || 'mongodb://127.0.0.1:27017/e-voting');
    console.log('Connected to DB');

    const cryptpassword = await bcrypt.hash('Admin@1234', 12);
    
    await User.create({
      Id: 1000000000,
      name: 'System Admin',
      email: 'admin@evoting.com',
      phone: 1234567890,
      DOB: new Date('1990-01-01'),
      electoralDistrict: 'Main Office',
      password: cryptpassword,
      role: 'admin'
    });

    console.log('Admin user created successfully!');
    process.exit(0);
  } catch (error) {
    if (error.code === 11000) {
      console.log('Admin user already exists!');
    } else {
      console.error('Error:', error.message);
    }
    process.exit(1);
  }
}

createAdmin();
