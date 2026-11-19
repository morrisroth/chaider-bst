// Signing key for admin login tokens, plus the per-admin "password version"
// that ties every token to the password it was issued under.
const crypto = require('crypto');

// There is deliberately no hard-coded fallback: the old one lived in the
// public source code, so anyone could have forged an admin token with it.
// Without JWT_SECRET we use a random key for this process only (admins just
// log in again after a restart) and say so loudly.
let SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 16) {
  SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('[auth] JWT_SECRET missing or too short in server/.env — using a temporary random key; admins will be logged out on every restart.');
}

// Changes whenever the password changes, which invalidates older tokens.
function passwordVersion(admin) {
  return crypto.createHash('sha256').update(String(admin.password_hash)).digest('hex').slice(0, 16);
}

module.exports = { SECRET, passwordVersion };
