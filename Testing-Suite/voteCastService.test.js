const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  assertObjectId,
  VoteCastError,
  isDuplicateKeyError
} = require('../services/voteCastService');

describe('voteCastService helpers', () => {
  test('assertObjectId rejects invalid ids', () => {
    assert.throws(
      () => assertObjectId('not-an-id', 'election ID'),
      (err) => err instanceof VoteCastError && err.code === 'INVALID_ID'
    );
  });

  test('assertObjectId accepts valid ObjectIds', () => {
    assert.doesNotThrow(() =>
      assertObjectId(new mongoose.Types.ObjectId().toString(), 'election ID')
    );
  });

  test('isDuplicateKeyError detects Mongo duplicate key codes', () => {
    assert.equal(isDuplicateKeyError({ code: 11000 }), true);
    assert.equal(isDuplicateKeyError({ code: 11001 }), true);
    assert.equal(isDuplicateKeyError({ code: 1 }), false);
  });
});
