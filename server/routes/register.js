const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { read, write, uuid } = require('../db');
const auth = require('../middleware/auth');
const { isPdfMagicBytes, isPngMagicBytes, isJpegMagicBytes } = require('../lib/pdfValidate');
const { contentDispositionAttachment } = require('../lib/contentDisposition');

// ID scans are sensitive — kept outside the public /uploads folder and only
// served to a logged-in admin through GET /:id/files/:idx.
const FILES_DIR = path.join(__dirname, '../documents/registrations');
fs.mkdirSync(FILES_DIR, { recursive: true });

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILES_PER_PARENT = 4;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_PARENT * 2 }
});

// Every text field on the public form — all are required.
const FIELDS = [
  // step 1 — child
  'firstName', 'lastName', 'idNumber', 'gregorianDob', 'hebrewDob', 'grade',
  'birthCountry', 'immigrantStatus', 'healthFund', 'address',
  // step 1 — parents
  'fatherName', 'fatherId', 'fatherPhone', 'fatherEmail',
  'motherName', 'motherId', 'motherPhone', 'motherEmail',
  // step 2 — father
  'fatherCommunity', 'fatherSynagogue', 'fatherMaritalStatus', 'fatherOccupation',
  'fatherStudiesTT', 'fatherStudiesYK', 'fatherStudiesYG', 'fatherAddress',
  // step 2 — mother
  'motherCommunity', 'motherMaritalStatus', 'motherOccupation', 'motherMaidenName',
  'motherStudiesElementary', 'motherStudiesSeminary', 'motherAddress',
  // step 2 — child's previous institution
  'previousSchool', 'previousStaffName', 'previousStaffPhone',
  // step 2 — general
  'recommendations', 'message',
];
const FILE_FIELDS = { fatherIdFiles: 'father', motherIdFiles: 'mother' };

function detectType(bytes) {
  if (isPdfMagicBytes(bytes)) return { ext: 'pdf', contentType: 'application/pdf' };
  if (isPngMagicBytes(bytes)) return { ext: 'png', contentType: 'image/png' };
  if (isJpegMagicBytes(bytes)) return { ext: 'jpg', contentType: 'image/jpeg' };
  return null;
}

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'יותר מדי ניסיונות, נסו שוב מאוחר יותר' }
});

const parseUpload = upload.fields(Object.keys(FILE_FIELDS).map(name => ({ name, maxCount: MAX_FILES_PER_PARENT })));

// public submit
router.post('/', submitLimiter, (req, res, next) => {
  parseUpload(req, res, err => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'כל קובץ מוגבל ל-8MB' });
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: `ניתן לצרף עד ${MAX_FILES_PER_PARENT} קבצים לכל הורה` });
    }
    next(err);
  });
}, (req, res) => {
  const body = req.body || {};
  const missing = FIELDS.filter(k => !String(body[k] || '').trim());
  if (missing.length) return res.status(400).json({ error: 'יש למלא את כל השדות', missing });

  const incoming = [];
  for (const [field, parent] of Object.entries(FILE_FIELDS)) {
    const files = req.files?.[field] || [];
    if (!files.length) {
      return res.status(400).json({ error: `יש לצרף צילום ת.ז. + ספח של ה${parent === 'father' ? 'אב' : 'אם'}` });
    }
    for (const f of files) {
      const type = detectType(f.buffer);
      if (!type) return res.status(400).json({ error: 'ניתן לצרף רק תמונות (JPG/PNG) או PDF' });
      incoming.push({ parent, bytes: f.buffer, ...type });
    }
  }

  const id = uuid();
  const files = incoming.map((f, i) => {
    const file = `reg-${id}-${f.parent}-${i + 1}.${f.ext}`;
    fs.writeFileSync(path.join(FILES_DIR, file), f.bytes);
    return { parent: f.parent, file, contentType: f.contentType };
  });

  const reg = { id };
  for (const k of FIELDS) reg[k] = String(body[k]).trim();
  Object.assign(reg, {
    homePhone: reg.fatherPhone, // shown in the admin list + dashboard
    email: reg.fatherEmail,
    files,
    notes: '', // admin-only notes
    status: 'pending',
    submittedAt: new Date().toISOString()
  });

  const regs = read('registrations.json');
  regs.push(reg);
  write('registrations.json', regs);
  res.status(201).json({ ok: true });
});

// admin
router.get('/', auth, (_, res) => {
  const regs = read('registrations.json').sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  res.json(regs);
});

router.get('/:id/files/:idx', auth, (req, res) => {
  const reg = read('registrations.json').find(r => r.id === req.params.id);
  const f = reg?.files?.[Number(req.params.idx)];
  if (!f) return res.status(404).json({ error: 'הקובץ לא נמצא' });
  const filePath = path.join(FILES_DIR, path.basename(f.file));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'הקובץ לא נמצא' });
  if (req.query.download) {
    const who = f.parent === 'father' ? 'אב' : 'אם';
    const ext = path.extname(f.file);
    res.setHeader('Content-Disposition', contentDispositionAttachment(`${reg.firstName} ${reg.lastName}-ת.ז. ${who}-${Number(req.params.idx) + 1}${ext}`));
  }
  res.setHeader('Content-Type', f.contentType || 'application/octet-stream');
  res.sendFile(filePath);
});

router.patch('/:id', auth, (req, res) => {
  const regs = read('registrations.json');
  const idx = regs.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'לא נמצא' });
  // Only the admin-editable fields — never let a PATCH rewrite stored file paths
  const { status, notes } = req.body || {};
  if (status !== undefined) regs[idx].status = status;
  if (notes !== undefined) regs[idx].notes = notes;
  write('registrations.json', regs);
  res.json(regs[idx]);
});

router.delete('/:id', auth, (req, res) => {
  const regs = read('registrations.json');
  const idx = regs.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'לא נמצא' });
  for (const f of regs[idx].files || []) {
    const p = path.join(FILES_DIR, path.basename(f.file));
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  regs.splice(idx, 1);
  write('registrations.json', regs);
  res.json({ ok: true });
});

module.exports = router;
