const router = require('express').Router();
const { read, write, uuid } = require('../db');
const auth = require('../middleware/auth');

// public submit
router.post('/', (req, res) => {
  const msgs = read('contacts.json');
  const msg = {
    id: uuid(),
    name: req.body.name || '',
    email: req.body.email || '',
    phone: req.body.phone || '',
    subject: req.body.subject || '',
    message: req.body.message || '',
    read: false,
    submittedAt: new Date().toISOString()
  };
  msgs.push(msg);
  write('contacts.json', msgs);
  res.status(201).json({ ok: true });
});

// admin
router.get('/', auth, (_, res) => {
  const msgs = read('contacts.json').sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  res.json(msgs);
});

router.patch('/:id', auth, (req, res) => {
  const msgs = read('contacts.json');
  const idx = msgs.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'לא נמצא' });
  msgs[idx] = { ...msgs[idx], ...req.body, id: msgs[idx].id };
  write('contacts.json', msgs);
  res.json(msgs[idx]);
});

router.delete('/:id', auth, (req, res) => {
  const msgs = read('contacts.json');
  const idx = msgs.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'לא נמצא' });
  msgs.splice(idx, 1);
  write('contacts.json', msgs);
  res.json({ ok: true });
});

module.exports = router;
