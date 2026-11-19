const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const { read, write } = require('../db');
const { optimizeHeroVideo } = require('../lib/videoOptimize');

const UPLOADS = path.join(__dirname, '../uploads');

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});

const imageUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = /^(jpe?g|png|gif|webp)$/.test(path.extname(file.originalname).slice(1).toLowerCase());
    cb(ok ? null : new Error('סוג קובץ לא מורשה'), ok);
  }
});

const videoUpload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = /^(mp4|mov|m4v|avi|mkv|webm)$/.test(path.extname(file.originalname).slice(1).toLowerCase());
    cb(ok ? null : new Error('סוג קובץ לא מורשה'), ok);
  }
});

router.post('/', auth, imageUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'לא נבחר קובץ' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

router.post('/video', auth, videoUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'לא נבחר קובץ' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Homepage background video: save the upload, then make a light web copy in
// the background. The live site keeps its current video until the copy is
// ready; the admin page polls /api/settings for hero_video_status.
function startHeroOptimize(original) {
  const srcName = path.basename(original);
  const srcPath = path.join(UPLOADS, srcName);
  const outName = srcName.replace(/\.[^.]+$/, '') + '-web.mp4';
  const outPath = path.join(UPLOADS, outName);
  optimizeHeroVideo(srcPath, outPath)
    .then(() => {
      const cur = read('settings.json');
      if (cur.hero_video_pending !== original) { fs.unlink(outPath, () => {}); return; } // replaced meanwhile
      write('settings.json', { ...cur, hero_video: `/uploads/${outName}`, hero_video_pending: '', hero_video_status: 'ready' });
      fs.unlink(srcPath, () => {});
    })
    .catch(err => {
      console.error('Hero video optimisation failed:', err.message);
      fs.unlink(outPath, () => {});
      const cur = read('settings.json');
      if (cur.hero_video_pending !== original) return;
      // Fall back to the original file rather than losing the upload
      write('settings.json', { ...cur, hero_video: original, hero_video_pending: '', hero_video_status: 'failed' });
    });
}

router.post('/hero-video', auth, videoUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'לא נבחר קובץ' });
  const original = `/uploads/${req.file.filename}`;
  const s = read('settings.json');
  write('settings.json', { ...s, hero_video_pending: original, hero_video_status: 'processing' });
  res.json({ url: original, status: 'processing' });
  startHeroOptimize(original);
});

// Every deploy restarts the server — pick up an encode that was cut short
{
  const s = read('settings.json');
  if (s.hero_video_status === 'processing' && s.hero_video_pending &&
      fs.existsSync(path.join(UPLOADS, path.basename(s.hero_video_pending)))) {
    startHeroOptimize(s.hero_video_pending);
  }
}

router.delete('/', auth, (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'חסר שם קובץ' });
  const file = path.join(UPLOADS, path.basename(filename));
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ ok: true });
});

module.exports = router;
