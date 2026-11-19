const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { read, write } = require('../db');
const auth = require('../middleware/auth');
const { SECRET, passwordVersion } = require('../lib/jwtSecret');

const issueToken = admin =>
  jwt.sign({ id: admin.id, username: admin.username, pv: passwordVersion(admin) }, SECRET, { expiresIn: '8h' });

// The seeded admin password (see db.js) — flagged until it's changed
const DEFAULT_PASSWORD = 'admin123';
const MIN_PASSWORD_LENGTH = 10;

// Slow down password guessing: 10 failed attempts per IP per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'יותר מדי ניסיונות התחברות. נסו שוב בעוד 15 דקות.' }
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  const admins = read('admins.json');
  const admin = admins.find(a => a.username === username || a.email === username);
  if (!admin || typeof password !== 'string' || !bcrypt.compareSync(password, admin.password_hash))
    return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
  res.json({ token: issueToken(admin), username: admin.username });
});

// Lets the admin panel warn while the default password is still in use
router.get('/me', auth, (req, res) => {
  const admin = read('admins.json').find(a => a.id === req.admin.id);
  if (!admin) return res.status(404).json({ error: 'לא נמצא' });
  res.json({ username: admin.username, weakPassword: bcrypt.compareSync(DEFAULT_PASSWORD, admin.password_hash) });
});

router.post('/change-password', auth, (req, res) => {
  const { current, newPass } = req.body || {};
  if (typeof newPass !== 'string' || newPass.length < MIN_PASSWORD_LENGTH)
    return res.status(400).json({ error: `הסיסמה החדשה חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים` });
  if (newPass === DEFAULT_PASSWORD)
    return res.status(400).json({ error: 'לא ניתן להשתמש בסיסמת ברירת המחדל' });
  const admins = read('admins.json');
  const idx = admins.findIndex(a => a.id === req.admin.id);
  if (idx === -1) return res.status(404).json({ error: 'לא נמצא' });
  if (typeof current !== 'string' || !bcrypt.compareSync(current, admins[idx].password_hash))
    return res.status(401).json({ error: 'הסיסמה הנוכחית שגויה' });
  admins[idx].password_hash = bcrypt.hashSync(newPass, 10);
  write('admins.json', admins);
  // Older tokens (other browsers/devices) stop working; this session gets a fresh one
  res.json({ ok: true, token: issueToken(admins[idx]) });
});

module.exports = router;
