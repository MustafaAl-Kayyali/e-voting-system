const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveVoterLoginQuery,
  resolveAdminLoginQuery
} = require('../utils/authLoginHelpers');

describe('auth login identifier resolution', () => {
  test('resolveVoterLoginQuery always uses nationalId', () => {
    assert.deepEqual(resolveVoterLoginQuery('ID-12345'), { nationalId: 'ID-12345' });
    assert.deepEqual(resolveVoterLoginQuery('user@example.com'), {
      nationalId: 'user@example.com'
    });
  });

  test('resolveAdminLoginQuery uses email for email-shaped input', () => {
    const query = resolveAdminLoginQuery('admin@example.com');
    assert.deepEqual(query, { email: 'admin@example.com' });
  });

  test('resolveAdminLoginQuery uses username otherwise', () => {
    const query = resolveAdminLoginQuery('superadmin');
    assert.deepEqual(query, { username: 'superadmin' });
  });
});
