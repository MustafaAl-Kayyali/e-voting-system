const { sanitizeInput, validateEmail } = require('./authUtils');

/** Voter login: national ID only */
const resolveVoterLoginQuery = (nationalId) => {
  const value = sanitizeInput(String(nationalId)).trim();
  return { nationalId: value };
};

/** Admin login: username or email */
const resolveAdminLoginQuery = (identifier) => {
  const value = sanitizeInput(String(identifier)).trim();
  if (validateEmail(value)) {
    return { email: value.toLowerCase() };
  }
  return { username: value };
};

module.exports = {
  resolveVoterLoginQuery,
  resolveAdminLoginQuery
};
