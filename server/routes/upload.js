const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');

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
    const ok = /jpeg|jpg|png|gif|webp/.test(path.extname(file.originalname).slice(1).toLowerCase());
    cb(ok ? null : new Error('סוג קובץ לא מורשה'), ok);
  }
});

const videoUpload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = /mp4|mov|avi|mkv|webm/.test(path.extname(file.originalname).slice(1).toLowerCase());
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

router.delete('/', auth, (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'חסר שם קובץ' });
  const file = path.join(UPLOADS, path.basename(filename));
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ ok: true });
});

module.exports = router;
