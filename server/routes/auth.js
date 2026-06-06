const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { read, write, uuid } = require('../db');

const SECRET = process.env.JWT_SECRET || 'chaider-bst-secret-2026';

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const admins = read('admins.json');
  const admin = admins.find(a => a.username === username || a.email === username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash))
    return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
  const token = jwt.sign({ id: admin.id, username: admin.username }, SECRET, { expiresIn: '8h' });
  res.json({ token, username: admin.username });
});

router.post('/change-password', require('../middleware/auth'), (req, res) => {
  const { current, newPass } = req.body;
  const admins = read('admins.json');
  const idx = admins.findIndex(a => a.id === req.admin.id);
  if (idx === -1) return res.status(404).json({ error: 'לא נמצא' });
  if (!bcrypt.compareSync(current, admins[idx].password_hash))
    return res.status(401).json({ error: 'הסיסמה הנוכחית שגויה' });
  admins[idx].password_hash = bcrypt.hashSync(newPass, 10);
  write('admins.json', admins);
  res.json({ ok: true });
});

module.exports = router;
