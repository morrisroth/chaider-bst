const jwt = require('jsonwebtoken');
const { read } = require('../db');
const { SECRET, passwordVersion } = require('../lib/jwtSecret');

module.exports = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'אין הרשאה' });
  let payload;
  try {
    payload = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'פג תוקף ההתחברות' });
  }
  // The admin must still exist and the password must not have changed since
  // the token was issued (changing it logs out every other session).
  const admin = read('admins.json').find(a => a.id === payload.id);
  if (!admin || payload.pv !== passwordVersion(admin)) {
    return res.status(401).json({ error: 'פג תוקף ההתחברות' });
  }
  req.admin = payload;
  next();
};
