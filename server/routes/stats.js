const router = require('express').Router();
const auth = require('../middleware/auth');
const { getStats } = require('../middleware/visitors');

router.get('/', auth, (_, res) => {
  res.json(getStats());
});

module.exports = router;
