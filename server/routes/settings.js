const router = require('express').Router();
const { read, write } = require('../db');
const auth = require('../middleware/auth');

router.get('/', (_, res) => res.json(read('settings.json')));

router.put('/', auth, (req, res) => {
  const current = read('settings.json');
  const updated = { ...current, ...req.body };
  write('settings.json', updated);
  res.json(updated);
});

module.exports = router;
