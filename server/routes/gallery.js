const router = require('express').Router();
const { read, write, uuid } = require('../db');
const auth = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

router.get('/', (_, res) => {
  const items = read('gallery.json').sort((a, b) => (a.order || 0) - (b.order || 0));
  res.json(items);
});

// The gallery is capped (keeps the public page light). Same numbers in admin/gallery.html.
const MAX_IMAGES = 100;
const MAX_VIDEOS = 10;

router.post('/', auth, (req, res) => {
  const items = read('gallery.json');
  const isVideo = req.body.type === 'video';
  const count = items.filter(i => (i.type === 'video') === isVideo).length;
  if (count >= (isVideo ? MAX_VIDEOS : MAX_IMAGES)) {
    // The file was already uploaded on its own — don't leave it orphaned
    const url = isVideo ? req.body.video : req.body.image;
    if (/^\/uploads\/[\w.-]+$/.test(url || '')) {
      const p = path.join(__dirname, '../uploads', path.basename(url));
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    return res.status(409).json({
      error: isVideo
        ? `הגלריה מוגבלת ל-${MAX_VIDEOS} סרטונים — מחקו סרטון ישן כדי להוסיף חדש`
        : `הגלריה מוגבלת ל-${MAX_IMAGES} תמונות — מחקו תמונות ישנות כדי להוסיף חדשות`
    });
  }
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

// Delete several items at once — body: { ids: [...] }
router.post('/bulk-delete', auth, (req, res) => {
  const ids = new Set(Array.isArray(req.body?.ids) ? req.body.ids : []);
  if (!ids.size) return res.status(400).json({ error: 'לא נבחרו פריטים' });
  const items = read('gallery.json');
  const kept = items.filter(i => !ids.has(i.id));
  write('gallery.json', kept);
  res.json({ ok: true, deleted: items.length - kept.length });
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
