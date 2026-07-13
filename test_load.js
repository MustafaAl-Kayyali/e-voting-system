try {
  const Voter = require('./backend/Models/voterModel');
  console.log('Voter model loaded successfully');
} catch (error) {
  console.error('Error loading Voter model:', error.message);
}
