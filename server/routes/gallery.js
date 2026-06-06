const router = require('express').Router();
const { read, write, uuid } = require('../db');
const auth = require('../middleware/auth');

router.get('/', (_, res) => {
  const items = read('gallery.json').sort((a, b) => (a.order || 0) - (b.order || 0));
  res.json(items);
});

router.post('/', auth, (req, res) => {
  const items = read('gallery.json');
  const item = {
    id: uuid(),
    type: req.body.type || 'image',   // 'image' | 'video'
    image: req.body.image || '',       // image URL or video thumbnail
    video: req.body.video || '',       // video URL (type=video only)
    caption: req.body.caption || '',
    category: req.body.category || 'כללי',
    layout: req.body.layout || 'normal',
    order: items.length,
    created_at: new Date().toISOString()
  };
  items.push(item);
  write('gallery.json', items);
  res.status(201).json(item);
});

router.patch('/:id', auth, (req, res) => {
  const items = read('gallery.json');
  const idx = items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'לא נמצא' });
  items[idx] = { ...items[idx], ...req.body, id: items[idx].id };
  write('gallery.json', items);
  res.json(items[idx]);
});

router.delete('/:id', auth, (req, res) => {
  const items = read('gallery.json');
  const idx = items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'לא נמצא' });
  items.splice(idx, 1);
  write('gallery.json', items);
  res.json({ ok: true });
});

module.exports = router;
