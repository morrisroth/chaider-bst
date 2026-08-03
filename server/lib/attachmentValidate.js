const { isPdfMagicBytes, isPngMagicBytes, isJpegMagicBytes } = require('./pdfValidate');

const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

// Attachments (bank-authorization receipts, etc.) are accepted as images or
// PDFs — actual file type is verified from magic bytes, never trusted from
// the data URL's declared MIME type or a client-supplied filename.
function decodeAttachment(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl || '');
  if (!match) return { error: 'קובץ האסמכתא אינו תקין' };
  let bytes;
  try {
    bytes = Buffer.from(match[2], 'base64');
  } catch {
    return { error: 'קובץ האסמכתא אינו תקין' };
  }
  if (!bytes.length || bytes.length > ATTACHMENT_MAX_BYTES) {
    return { error: 'קובץ האסמכתא חורג מהגודל המותר (עד 8MB)' };
  }
  if (isPdfMagicBytes(bytes)) return { bytes, ext: 'pdf', contentType: 'application/pdf' };
  if (isPngMagicBytes(bytes)) return { bytes, ext: 'png', contentType: 'image/png' };
  if (isJpegMagicBytes(bytes)) return { bytes, ext: 'jpg', contentType: 'image/jpeg' };
  return { error: 'קובץ האסמכתא חייב להיות תמונה (JPG/PNG) או PDF' };
}

module.exports = { decodeAttachment, ATTACHMENT_MAX_BYTES };
