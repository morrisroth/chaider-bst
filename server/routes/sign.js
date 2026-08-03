const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { read, write, uuid } = require('../db');
const { ORIGINALS_DIR, SIGNED_DIR, RENDERED_DIR, ATTACHMENTS_DIR } = require('../lib/documentPaths');
const { hashToken } = require('../lib/signToken');
const { getEffectiveStatus } = require('../lib/documentStatus');
const { withLock } = require('../lib/lock');
const { isPngMagicBytes } = require('../lib/pdfValidate');
const { decodeAttachment } = require('../lib/attachmentValidate');
const { embedSignatures } = require('../lib/pdfSign');
const { getClientIp } = require('../lib/clientIp');
const { getSignatureFields } = require('../lib/signatureFields');
const { sendSignedDocumentEmail } = require('../lib/mailer');
const { renderPageToPng } = require('../lib/pdfRender');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    introText: current.introText || '',
    attachmentRequired: !!current.attachmentRequired,
    attachmentLabel: current.attachmentLabel || 'אסמכתא',
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

// Each page rendered to a PNG server-side — see server/lib/pdfRender.js for
// why. Cached to disk on first request since the original PDF never
// changes once uploaded; every subsequent signer (and re-visits) hits the
// cached file directly instead of re-rendering.
router.get('/:token/page/:pageNum', async (req, res) => {
  const tokenHash = hashToken(req.params.token);
  const doc = read('documents.json').find(d => d.tokenHash === tokenHash);
  const eff = getEffectiveStatus(doc);
  if (['not-found', 'revoked', 'expired'].includes(eff)) return res.status(404).json({ error: 'הקובץ אינו זמין' });

  const pageNum = parseInt(req.params.pageNum, 10);
  if (!Number.isInteger(pageNum) || pageNum < 1 || pageNum > doc.pageCount) {
    return res.status(400).json({ error: 'מספר עמוד אינו תקין' });
  }

  const cacheFile = path.join(RENDERED_DIR, `${doc.originalFile}-p${pageNum}.png`);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  if (fs.existsSync(cacheFile)) return res.sendFile(cacheFile);

  const originalPath = path.join(ORIGINALS_DIR, doc.originalFile);
  if (!fs.existsSync(originalPath)) return res.status(404).json({ error: 'הקובץ אינו זמין' });

  try {
    const pngBuffer = await renderPageToPng(fs.readFileSync(originalPath), pageNum);
    fs.writeFileSync(cacheFile, pngBuffer);
    res.send(pngBuffer);
  } catch (e) {
    console.error('Page render failed:', e);
    res.status(500).json({ error: 'שגיאה בעיבוד המסמך' });
  }
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

      const { signerName, signerEmail, signatures, consent, attachment } = req.body || {};
      const name = (signerName || '').trim();
      const email = (signerEmail || '').trim();
      if (!name) return { status: 400, error: 'נא להזין שם מלא' };
      if (!email || !EMAIL_RE.test(email)) return { status: 400, error: 'נא להזין כתובת מייל תקינה' };
      if (consent !== true) return { status: 400, error: 'יש לאשר את הצהרת ההסכמה' };

      let decodedAttachment = null;
      if (doc.attachmentRequired) {
        if (!attachment) return { status: 400, error: `יש לצרף ${doc.attachmentLabel || 'אסמכתא'}` };
        decodedAttachment = decodeAttachment(attachment);
        if (decodedAttachment.error) return { status: 400, error: decodedAttachment.error };
      }

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

      let attachmentFilename = null;
      if (decodedAttachment) {
        attachmentFilename = `attachment-${doc.id}-${signatureId}.${decodedAttachment.ext}`;
        fs.writeFileSync(path.join(ATTACHMENTS_DIR, attachmentFilename), decodedAttachment.bytes);
      }

      const signatureRecords = read('document_signatures.json');
      signatureRecords.push({
        id: signatureId,
        documentId: doc.id,
        signerName: name,
        signerEmail: email,
        signedAt: signedAtIso,
        signedFile: signedFilename,
        attachmentFile: attachmentFilename,
        attachmentContentType: decodedAttachment ? decodedAttachment.contentType : null,
        consentGiven: true,
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'] || '',
        createdAt: signedAtIso
      });
      write('document_signatures.json', signatureRecords);

      logEvent(doc.id, 'signed', name, req);
      logEvent(doc.id, 'pdf_generated', '', req);

      return { status: 200, documentId: doc.id, title: doc.title, name, email, signedBytes, signedFilename };
    });

    if (result.status !== 200) return res.status(result.status).json({ error: result.error });

    // Email delivery is best-effort — the signature itself already succeeded
    // and is saved regardless of whether the email goes out.
    try {
      await sendSignedDocumentEmail({
        to: result.email,
        studentName: result.name,
        documentTitle: result.title,
        pdfBytes: result.signedBytes,
        pdfFilename: `${result.title}.pdf`
      });
      logEvent(result.documentId, 'email_sent', result.email, req);
    } catch (e) {
      console.error('Failed to send signed document email:', e.message);
      logEvent(result.documentId, 'email_failed', e.message, req);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('Sign submission failed:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

module.exports = router;
