const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { read, write, uuid } = require('../db');
const { ORIGINALS_DIR, SIGNED_DIR } = require('../lib/documentPaths');
const { hashToken } = require('../lib/signToken');
const { getEffectiveStatus } = require('../lib/documentStatus');
const { withLock } = require('../lib/lock');
const { isPngMagicBytes } = require('../lib/pdfValidate');
const { embedSignatures } = require('../lib/pdfSign');
const { getClientIp } = require('../lib/clientIp');
const { getSignatureFields } = require('../lib/signatureFields');

// A signing link is shared with (and can be signed by) many different
// people — there is no single "the signer" and no "already signed" terminal
// state at the document level. Each submission is its own signature record
// with its own generated PDF; the link keeps accepting submissions until the
// admin revokes it or it expires.

const ERROR_MESSAGES = {
  'not-found': 'הקישור אינו תקין',
  revoked: 'קישור זה בוטל על ידי המנהל',
  expired: 'פג תוקפו של קישור זה',
};

function formatDateDDMMYYYY(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

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

// Generous read-side limit — normal PDF loading (metadata + file fetch) stays well under it
const signLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false,
  message: { error: 'יותר מדי בקשות, נסו שוב מאוחר יותר' }
});
// Stricter — submission is more expensive (PDF generation)
const signSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'יותר מדי ניסיונות שליחה, נסו שוב מאוחר יותר' }
});

router.use(signLimiter);

router.get('/:token', (req, res) => {
  const tokenHash = hashToken(req.params.token);
  const docs = read('documents.json');
  const idx = docs.findIndex(d => d.tokenHash === tokenHash);
  const doc = idx === -1 ? null : docs[idx];
  const eff = getEffectiveStatus(doc);

  if (eff === 'not-found') return res.status(404).json({ error: ERROR_MESSAGES['not-found'] });
  if (eff === 'revoked') return res.status(410).json({ error: ERROR_MESSAGES.revoked });
  if (eff === 'expired') {
    if (doc.status !== 'expired') {
      docs[idx] = { ...doc, status: 'expired', updatedAt: new Date().toISOString() };
      write('documents.json', docs);
      logEvent(doc.id, 'expired', '', req);
    }
    return res.status(410).json({ error: ERROR_MESSAGES.expired });
  }
  if (eff === 'pending') {
    docs[idx] = { ...doc, status: 'opened', openedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    write('documents.json', docs);
    logEvent(doc.id, 'opened', '', req);
  }

  const current = docs[idx];
  res.json({
    id: current.id,
    title: current.title,
    status: current.status,
    pageCount: current.pageCount,
    expiresAt: current.expiresAt,
    signerNameSuggested: current.clientName,
    signatureFields: getSignatureFields(current).map(({ key, label, page, x, y, width, height }) =>
      ({ key, label, page, x, y, width, height })),
    pdfUrl: `/api/sign/${req.params.token}/file`
  });
});

// Always the blank original — every visitor signs their own fresh copy
router.get('/:token/file', (req, res) => {
  const tokenHash = hashToken(req.params.token);
  const doc = read('documents.json').find(d => d.tokenHash === tokenHash);
  const eff = getEffectiveStatus(doc);
  if (['not-found', 'revoked', 'expired'].includes(eff)) return res.status(404).json({ error: 'הקובץ אינו זמין' });

  const filePath = path.join(ORIGINALS_DIR, doc.originalFile);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'הקובץ אינו זמין' });
  res.setHeader('Content-Type', 'application/pdf');
  res.sendFile(filePath);
});

router.post('/:token', signSubmitLimiter, async (req, res) => {
  const tokenHash = hashToken(req.params.token);
  const initialDoc = read('documents.json').find(d => d.tokenHash === tokenHash);
  if (!initialDoc) return res.status(404).json({ error: ERROR_MESSAGES['not-found'] });

  try {
    const result = await withLock(initialDoc.id, async () => {
      const docs = read('documents.json');
      const idx = docs.findIndex(d => d.id === initialDoc.id);
      const doc = docs[idx];
      const eff = getEffectiveStatus(doc);

      if (eff === 'not-found') return { status: 404, error: ERROR_MESSAGES['not-found'] };
      if (eff === 'revoked') return { status: 410, error: ERROR_MESSAGES.revoked };
      if (eff === 'expired') return { status: 410, error: ERROR_MESSAGES.expired };

      const { signerName, signatures, consent } = req.body || {};
      const name = (signerName || '').trim();
      if (!name) return { status: 400, error: 'נא להזין שם מלא' };
      if (consent !== true) return { status: 400, error: 'יש לאשר את הצהרת ההסכמה' };

      const fields = getSignatureFields(doc);
      if (!fields.length) return { status: 500, error: 'לא הוגדר מקום חתימה במסמך' };

      const prefix = 'data:image/png;base64,';
      const embedFields = [];
      for (const field of fields) {
        const dataUrl = signatures && signatures[field.key];
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix)) {
          return { status: 400, error: `חסרה חתימה עבור ${field.label}` };
        }
        let pngBytes;
        try {
          pngBytes = Buffer.from(dataUrl.slice(prefix.length), 'base64');
        } catch {
          return { status: 400, error: `קובץ החתימה עבור ${field.label} אינו תקין` };
        }
        if (!pngBytes.length || pngBytes.length > 1.5 * 1024 * 1024 || !isPngMagicBytes(pngBytes)) {
          return { status: 400, error: `קובץ החתימה עבור ${field.label} אינו תקין` };
        }
        embedFields.push({ page: field.page, x: field.x, y: field.y, width: field.width, height: field.height, pngBytes });
      }

      const originalPath = path.join(ORIGINALS_DIR, doc.originalFile);
      if (!fs.existsSync(originalPath)) return { status: 500, error: 'המסמך המקורי אינו זמין' };

      const signatureId = uuid();
      const signedAtIso = new Date().toISOString();
      let signedBytes;
      try {
        signedBytes = await embedSignatures(fs.readFileSync(originalPath), {
          fields: embedFields,
          dateField: doc.dateField || null,
          dateText: doc.dateField ? formatDateDDMMYYYY(signedAtIso) : null
        });
      } catch (e) {
        console.error('PDF signing failed:', e);
        return { status: 500, error: 'שגיאה ביצירת המסמך החתום' };
      }

      const signedFilename = `signed-${doc.id}-${signatureId}.pdf`;
      fs.writeFileSync(path.join(SIGNED_DIR, signedFilename), signedBytes);

      const signatureRecords = read('document_signatures.json');
      signatureRecords.push({
        id: signatureId,
        documentId: doc.id,
        signerName: name,
        signedAt: signedAtIso,
        signedFile: signedFilename,
        consentGiven: true,
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'] || '',
        createdAt: signedAtIso
      });
      write('document_signatures.json', signatureRecords);

      logEvent(doc.id, 'signed', name, req);
      logEvent(doc.id, 'pdf_generated', '', req);

      return { status: 200 };
    });

    if (result.status !== 200) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true });
  } catch (e) {
    console.error('Sign submission failed:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

module.exports = router;
