const mongoose = require('mongoose');
const Administrator = require('./Models/administratorModel');
const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

async function testCreate() {
  try {
    await mongoose.connect(process.env.DATABASE || 'mongodb://localhost:27017/evoting');
    console.log('Connected to DB');
    
    const admin = await Administrator.create({
      username: 'testadmin' + Date.now(),
      firstName: 'Test',
      lastName: 'Admin',
      email: 'test' + Date.now() + '@example.com',
      password: 'Password123!',
      role: 'super_admin'
    });
    
    console.log('Admin created:', admin._id);
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err.message);
    process.exit(1);
  }
}

testCreate();
