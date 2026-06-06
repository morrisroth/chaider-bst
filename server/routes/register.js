const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const { read, write, uuid } = require('../db');
const auth = require('../middleware/auth');

const UPLOADS = path.join(__dirname, '../uploads');
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `reg-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

// public submit
router.post('/', upload.fields([{ name: 'photo', maxCount: 1 }]), (req, res) => {
  const regs = read('registrations.json');
  const reg = {
    id: uuid(),
    firstName: req.body.firstName || '',
    lastName: req.body.lastName || '',
    idNumber: req.body.idNumber || '',
    hebrewDob: req.body.hebrewDob || '',
    gregorianDob: req.body.gregorianDob || '',
    grade: req.body.grade || '',
    address: req.body.address || '',
    homePhone: req.body.phone || '',
    fatherName: req.body.fatherName || '',
    motherName: req.body.motherName || '',
    email: req.body.email || '',
    currentSchool: req.body.currentSchool || '',
    notes: req.body.notes || '',
    photo: req.files?.photo ? `/uploads/${req.files.photo[0].filename}` : '',
    status: 'pending',
    submittedAt: new Date().toISOString()
  };
  regs.push(reg);
  write('registrations.json', regs);
  res.status(201).json({ ok: true });
});

// admin
router.get('/', auth, (_, res) => {
  const regs = read('registrations.json').sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  res.json(regs);
});

router.patch('/:id', auth, (req, res) => {
  const regs = read('registrations.json');
  const idx = regs.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'לא נמצא' });
  regs[idx] = { ...regs[idx], ...req.body, id: regs[idx].id };
  write('registrations.json', regs);
  res.json(regs[idx]);
});

router.delete('/:id', auth, (req, res) => {
  const regs = read('registrations.json');
  const idx = regs.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'לא נמצא' });
  regs.splice(idx, 1);
  write('registrations.json', regs);
  res.json({ ok: true });
});

module.exports = router;
