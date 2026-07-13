const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { validateEmail, validatePassword } = require('../utils/authUtils');

describe('auth validation utilities', () => {
  test('validateEmail accepts valid addresses', () => {
    assert.equal(validateEmail('user@example.com'), true);
  });

  test('validateEmail rejects invalid addresses', () => {
    assert.equal(validateEmail('not-an-email'), false);
  });

  test('validatePassword enforces complexity rules', () => {
    const weak = validatePassword('password');
    assert.equal(weak.isValid, false);
    assert.ok(weak.errors.length > 0);

    const strong = validatePassword('Str0ng!Pass');
    assert.equal(strong.isValid, true);
  });
});
