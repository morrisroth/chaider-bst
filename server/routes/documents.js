const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const { read, write, uuid } = require('../db');
const auth = require('../middleware/auth');
const { ORIGINALS_DIR, SIGNED_DIR, RENDERED_DIR, ATTACHMENTS_DIR } = require('../lib/documentPaths');
const { generateToken, hashToken } = require('../lib/signToken');
const { isPdfMagicBytes } = require('../lib/pdfValidate');
const { getEffectiveStatus } = require('../lib/documentStatus');
const { getClientIp } = require('../lib/clientIp');
const { contentDispositionAttachment } = require('../lib/contentDisposition');

const APP_URL = process.env.APP_URL || 'http://localhost:4000';

// ── helpers ──

function logEvent(documentId, type, message, req) {
  const events = read('document_events.json');
  events.push({
    id: uuid(),
    documentId,
    type,
    message: message || '',
    ip: req ? getClientIp(req) : '',
    userAgent: req ? (req.headers['user-agent'] || '') : '',
    createdAt: new Date().toISOString()
  });
  write('document_events.json', events);
}

// The raw token is stored (not just its hash) so the admin can look up and
// re-copy the *same* signing link at any time, without rotating it and
// breaking copies already shared with parents. It's never exposed to the
// public signing routes — those still validate by hash. `publicDoc` strips
// the raw token out of the response and replaces it with the built signUrl.
function publicDoc(doc) {
  const { tokenHash, token, ...rest } = doc;
  return { ...rest, status: getEffectiveStatus(doc), signUrl: token ? `${APP_URL}/sign/${token}` : null };
}

// ── PDF upload (step 1 of the admin wizard — no document record yet) ──

const uploadStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, ORIGINALS_DIR),
  filename: (_, file, cb) => {
    cb(null, `doc-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  }
});

const pdfUpload = multer({
  storage: uploadStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const extOk = path.extname(file.originalname).toLowerCase() === '.pdf';
    const mimeOk = file.mimetype === 'application/pdf';
    cb(extOk && mimeOk ? null : new Error('יש להעלות קובץ PDF בלבד'), extOk && mimeOk);
  }
});

function handlePdfUpload(req, res, next) {
  pdfUpload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'הקובץ גדול מדי (מקסימום 20MB)' : (err.message || 'שגיאת העלאה');
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

router.post('/upload', auth, handlePdfUpload, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'לא נבחר קובץ' });
  const filePath = path.join(ORIGINALS_DIR, req.file.filename);
  try {
    const buffer = fs.readFileSync(filePath);
    if (!isPdfMagicBytes(buffer)) throw new Error('invalid');
    const pdfDoc = await PDFDocument.load(buffer);
    const pageCount = pdfDoc.getPageCount();
    if (pageCount < 1) throw new Error('invalid');
    res.json({ file: req.file.filename, pageCount });
  } catch {
    fs.unlink(filePath, () => {});
    res.status(400).json({ error: 'קובץ ה-PDF אינו תקין או פגום' });
  }
});

// Auth-gated stream of a just-uploaded original, before a document record exists
router.get('/preview/:filename', auth, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(ORIGINALS_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'הקובץ לא נמצא' });
  res.setHeader('Content-Type', 'application/pdf');
  res.sendFile(filePath);
});

// ── document CRUD ──
// A document's signing link can be opened and signed by many different
// people — there is no single "the signer"; each submission is recorded
// separately in document_signatures.json, each with its own generated PDF.

// Normalizes and bounds-checks a single field spec against the loaded PDF.
async function validateField(pdfDoc, pageCount, field, label) {
  const page = Number(field.page), x = Number(field.x), y = Number(field.y),
    w = Number(field.width), h = Number(field.height);
  if (![page, x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
    throw new Error(`מיקום ${label} אינו תקין`);
  }
  if (page < 1 || page > pageCount) throw new Error(`מיקום ${label} חורג מגבולות המסמך`);
  const { width: pageW, height: pageH } = pdfDoc.getPage(page - 1).getSize();
  if (x < 0 || y < 0 || x + w > pageW + 0.5 || y + h > pageH + 0.5) {
    throw new Error(`מיקום ${label} חורג מגבולות העמוד`);
  }
  return { page, x, y, width: w, height: h };
}

router.post('/', auth, async (req, res) => {
  const {
    title, documentLabel, clientName, clientEmail, clientPhone, originalFile,
    signatureFields, dateField,
    introText, attachmentRequired, attachmentLabel,
    expiresAt
  } = req.body;

  if (!title || !originalFile) {
    return res.status(400).json({ error: 'חסרים פרטים: כותרת וקובץ מקור' });
  }
  if (!Array.isArray(signatureFields) || !signatureFields.length) {
    return res.status(400).json({ error: 'יש לסמן לפחות מקום חתימה אחד' });
  }
  for (const f of signatureFields) {
    if (!f || typeof f.key !== 'string' || !f.key.trim() || typeof f.label !== 'string' || !f.label.trim()) {
      return res.status(400).json({ error: 'מיקום החתימה אינו תקין' });
    }
  }

  const filePath = path.join(ORIGINALS_DIR, path.basename(originalFile));
  if (!fs.existsSync(filePath)) return res.status(400).json({ error: 'קובץ המקור לא נמצא, יש להעלות מחדש' });

  let pageCount, normalizedFields, normalizedDateField;
  try {
    const pdfDoc = await PDFDocument.load(fs.readFileSync(filePath));
    pageCount = pdfDoc.getPageCount();
    normalizedFields = [];
    for (const f of signatureFields) {
      const box = await validateField(pdfDoc, pageCount, f, f.label);
      normalizedFields.push({ key: f.key.trim(), label: f.label.trim(), ...box });
    }
    normalizedDateField = dateField ? await validateField(pdfDoc, pageCount, dateField, 'תאריך') : null;
  } catch (e) {
    return res.status(400).json({ error: e.message || 'מיקום החתימה חורג מגבולות העמוד' });
  }

  const token = generateToken();
  const now = new Date().toISOString();
  const doc = {
    id: uuid(),
    title,
    documentLabel: (documentLabel || '').trim() || title,
    clientName: clientName || '',
    clientEmail: clientEmail || '',
    clientPhone: clientPhone || '',
    originalFile: path.basename(originalFile),
    token,
    tokenHash: hashToken(token),
    status: 'pending',
    pageCount,
    signatureFields: normalizedFields,
    dateField: normalizedDateField,
    introText: introText || '',
    attachmentRequired: !!attachmentRequired,
    attachmentLabel: attachmentLabel || 'אסמכתא',
    expiresAt: expiresAt || null,
    openedAt: null, revokedAt: null,
    createdAt: now, updatedAt: now,
    createdBy: req.admin.id
  };

  const docs = read('documents.json');
  docs.push(doc);
  write('documents.json', docs);
  logEvent(doc.id, 'created', '', req);
  logEvent(doc.id, 'link_generated', '', req);

  res.status(201).json(publicDoc(doc));
});

router.get('/', auth, (_, res) => {
  const docs = read('documents.json').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const signatures = read('document_signatures.json');
  const countByDoc = signatures.reduce((m, s) => (m[s.documentId] = (m[s.documentId] || 0) + 1, m), {});
  res.json(docs.map(d => ({ ...publicDoc(d), signatureCount: countByDoc[d.id] || 0 })));
});

router.get('/:id', auth, (req, res) => {
  const doc = read('documents.json').find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'המסמך לא נמצא' });
  const events = read('document_events.json')
    .filter(e => e.documentId === doc.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const signatures = read('document_signatures.json')
    .filter(s => s.documentId === doc.id)
    .sort((a, b) => new Date(b.signedAt) - new Date(a.signedAt))
    .map(({ documentId, ...rest }) => rest);
  res.json({ ...publicDoc(doc), events, signatures });
});

router.patch('/:id', auth, (req, res) => {
  const docs = read('documents.json');
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'המסמך לא נמצא' });
  const { title, documentLabel, clientName, clientEmail, clientPhone, expiresAt } = req.body;
  const patch = {};
  if (title !== undefined) patch.title = title;
  if (documentLabel !== undefined) patch.documentLabel = documentLabel;
  if (clientName !== undefined) patch.clientName = clientName;
  if (clientEmail !== undefined) patch.clientEmail = clientEmail;
  if (clientPhone !== undefined) patch.clientPhone = clientPhone;
  if (expiresAt !== undefined) patch.expiresAt = expiresAt;
  docs[idx] = { ...docs[idx], ...patch, updatedAt: new Date().toISOString() };
  write('documents.json', docs);
  res.json(publicDoc(docs[idx]));
});

router.post('/:id/relink', auth, (req, res) => {
  const docs = read('documents.json');
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'המסמך לא נמצא' });
  const doc = docs[idx];
  const token = generateToken();
  docs[idx] = {
    ...doc,
    token,
    tokenHash: hashToken(token),
    status: 'pending',
    openedAt: null,
    revokedAt: null,
    expiresAt: req.body?.expiresAt !== undefined ? req.body.expiresAt : doc.expiresAt,
    updatedAt: new Date().toISOString()
  };
  write('documents.json', docs);
  logEvent(doc.id, 'relinked', '', req);
  res.json(publicDoc(docs[idx]));
});

router.post('/:id/revoke', auth, (req, res) => {
  const docs = read('documents.json');
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'המסמך לא נמצא' });
  docs[idx] = { ...docs[idx], status: 'revoked', revokedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  write('documents.json', docs);
  logEvent(docs[idx].id, 'revoked', '', req);
  res.json(publicDoc(docs[idx]));
});

router.delete('/:id', auth, (req, res) => {
  const docs = read('documents.json');
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'המסמך לא נמצא' });
  const doc = docs[idx];

  if (doc.originalFile) {
    const p = path.join(ORIGINALS_DIR, doc.originalFile);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    for (let page = 1; page <= (doc.pageCount || 0); page++) {
      const rp = path.join(RENDERED_DIR, `${doc.originalFile}-p${page}.png`);
      if (fs.existsSync(rp)) fs.unlinkSync(rp);
    }
  }

  const signatures = read('document_signatures.json');
  signatures.filter(s => s.documentId === doc.id).forEach(s => {
    if (s.signedFile) {
      const p = path.join(SIGNED_DIR, s.signedFile);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    if (s.attachmentFile) {
      const ap = path.join(ATTACHMENTS_DIR, s.attachmentFile);
      if (fs.existsSync(ap)) fs.unlinkSync(ap);
    }
  });
  write('document_signatures.json', signatures.filter(s => s.documentId !== doc.id));

  docs.splice(idx, 1);
  write('documents.json', docs);
  write('document_events.json', read('document_events.json').filter(e => e.documentId !== req.params.id));
  res.json({ ok: true });
});

// ── downloads (admin only) ──

router.get('/:id/file/original', auth, (req, res) => {
  const doc = read('documents.json').find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'המסמך לא נמצא' });
  const filePath = path.join(ORIGINALS_DIR, doc.originalFile);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'הקובץ לא נמצא' });
  if (req.query.download) {
    res.setHeader('Content-Disposition', contentDispositionAttachment(`${doc.title}.pdf`));
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.sendFile(filePath);
});

router.get('/:id/signatures/:sigId/file', auth, (req, res) => {
  const doc = read('documents.json').find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'המסמך לא נמצא' });
  const sig = read('document_signatures.json').find(s => s.id === req.params.sigId && s.documentId === doc.id);
  if (!sig) return res.status(404).json({ error: 'החתימה לא נמצאה' });
  const filePath = path.join(SIGNED_DIR, sig.signedFile);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'הקובץ לא נמצא' });
  if (req.query.download) {
    res.setHeader('Content-Disposition', contentDispositionAttachment(`${doc.title}-${sig.signerName}.pdf`));
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.sendFile(filePath);
});

router.get('/:id/signatures/:sigId/attachment', auth, (req, res) => {
  const doc = read('documents.json').find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'המסמך לא נמצא' });
  const sig = read('document_signatures.json').find(s => s.id === req.params.sigId && s.documentId === doc.id);
  if (!sig || !sig.attachmentFile) return res.status(404).json({ error: 'לא צורפה אסמכתא לחתימה זו' });
  const filePath = path.join(ATTACHMENTS_DIR, sig.attachmentFile);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'הקובץ לא נמצא' });
  const ext = path.extname(sig.attachmentFile).slice(1);
  if (req.query.download) {
    res.setHeader('Content-Disposition', contentDispositionAttachment(`${doc.title}-${sig.signerName}-אסמכתא.${ext}`));
  }
  res.setHeader('Content-Type', sig.attachmentContentType || 'application/octet-stream');
  res.sendFile(filePath);
});

// Removes a single signature (e.g. a test/mistaken submission) without
// touching the document or its other signatures.
router.delete('/:id/signatures/:sigId', auth, (req, res) => {
  const doc = read('documents.json').find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'המסמך לא נמצא' });
  const signatures = read('document_signatures.json');
  const sig = signatures.find(s => s.id === req.params.sigId && s.documentId === doc.id);
  if (!sig) return res.status(404).json({ error: 'החתימה לא נמצאה' });

  if (sig.signedFile) {
    const p = path.join(SIGNED_DIR, sig.signedFile);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  if (sig.attachmentFile) {
    const ap = path.join(ATTACHMENTS_DIR, sig.attachmentFile);
    if (fs.existsSync(ap)) fs.unlinkSync(ap);
  }

  write('document_signatures.json', signatures.filter(s => s.id !== sig.id));
  logEvent(doc.id, 'signature_deleted', sig.signerName, req);
  res.json({ ok: true });
});

module.exports = router;
