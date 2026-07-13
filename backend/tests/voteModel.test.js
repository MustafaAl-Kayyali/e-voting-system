const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Vote = require('../Models/voteModel');

describe('Vote model integrity', () => {
  test('computeVoteHash is stable for the same document state', () => {
    const createdAt = new Date('2024-01-01T00:00:00.000Z');
    const vote = new Vote({
      voter: new mongoose.Types.ObjectId(),
      election: new mongoose.Types.ObjectId(),
      candidate: new mongoose.Types.ObjectId(),
      encryptedVote: 'cipher',
      authenticationMethod: 'password',
      createdAt
    });

    const hashA = vote.computeVoteHash();
    const hashB = vote.computeVoteHash();
    assert.equal(hashA, hashB);
  });

  test('verifyIntegrity returns true after voteHash is set from computeVoteHash', () => {
    const createdAt = new Date('2024-01-01T00:00:00.000Z');
    const vote = new Vote({
      voter: new mongoose.Types.ObjectId(),
      election: new mongoose.Types.ObjectId(),
      candidate: new mongoose.Types.ObjectId(),
      encryptedVote: 'cipher',
      authenticationMethod: 'password',
      createdAt
    });

    vote.voteHash = vote.computeVoteHash();
    assert.equal(vote.verifyIntegrity(), true);
  });

  test('verifyIntegrity returns false when voteHash is tampered', () => {
    const vote = new Vote({
      voter: new mongoose.Types.ObjectId(),
      election: new mongoose.Types.ObjectId(),
      candidate: new mongoose.Types.ObjectId(),
      encryptedVote: 'cipher',
      authenticationMethod: 'password',
      createdAt: new Date()
    });

    vote.voteHash = vote.computeVoteHash();
    vote.voteHash = 'tampered';
    assert.equal(vote.verifyIntegrity(), false);
  });
});
