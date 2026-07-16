const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

// pdf-lib/fontkit's own font shaping DOES auto-reverse glyphs for Hebrew text
// — but only as a *blanket* reversal of the entire string passed to a single
// drawText() call, triggered whenever it detects any Hebrew character in that
// call. It has no real per-run bidi splitting, so a call mixing Hebrew with a
// Latin/digit run (a UUID, "IP", "UTC", a year) gets that embedded run
// blanket-reversed too ("IP" becomes "PI", "2001" becomes "1002"). The fix is
// to never feed it a mixed-script string: split the line into Hebrew vs.
// non-Hebrew runs and draw each run with its own isolated drawText() call —
// Hebrew runs alone trigger (correct) auto-reversal, non-Hebrew runs alone
// have no Hebrew present to trigger any reversal at all.
function isHebrewChar(ch) {
  const code = ch.codePointAt(0);
  return code >= 0x0590 && code <= 0x05ff;
}

function splitRuns(text) {
  const runs = [];
  let current = '';
  let currentIsHebrew = null;
  for (const ch of String(text)) {
    const heb = isHebrewChar(ch);
    if (currentIsHebrew === null || heb === currentIsHebrew) {
      current += ch;
      currentIsHebrew = heb;
    } else {
      runs.push(current);
      current = ch;
      currentIsHebrew = heb;
    }
  }
  if (current) runs.push(current);
  return runs;
}

// Draws `text` right-aligned so its right edge lands at xRight. Runs are
// drawn in their original (typed/logical) order, each isolated in its own
// drawText call, laid out right-to-left — the first run ends up rightmost,
// matching RTL reading order, while a run's own internal script (Hebrew
// auto-reversed by fontkit, Latin/digits left alone) renders correctly.
function drawBidiText(page, text, { font, size, y, xRight, color }) {
  let cx = xRight;
  for (const run of splitRuns(text)) {
    const w = font.widthOfTextAtSize(run, size);
    page.drawText(run, { x: cx - w, y, size, font, color });
    cx -= w;
  }
}

function widthOfBidiText(text, font, size) {
  return splitRuns(text).reduce((sum, run) => sum + font.widthOfTextAtSize(run, size), 0);
}

// Draws "label: value" right-aligned at xRight.
function drawLabelValue(page, { label, value, font, size, xRight, y, color }) {
  const labelText = label + ': ';
  const labelW = widthOfBidiText(labelText, font, size);
  drawBidiText(page, labelText, { font, size, xRight, y, color });
  const valueText = String(value);
  drawBidiText(page, valueText, { font, size, xRight: xRight - labelW, y, color });
}

async function embedSignature(pdfBytes, opts) {
  const {
    page: pageNum, x, y, width, height, pngBytes,
    signerName, signedAt, docId, ip, userAgent, title,
    fontBytes, fontBoldBytes
  } = opts;

  const pdfDoc = await PDFDocument.load(pdfBytes);
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes);
  const boldFont = fontBoldBytes ? await pdfDoc.embedFont(fontBoldBytes) : font;

  const pngImage = await pdfDoc.embedPng(pngBytes);
  const page = pdfDoc.getPage(pageNum - 1);
  page.drawImage(pngImage, { x, y, width, height });

  const ink = rgb(0.08, 0.16, 0.18);
  const muted = rgb(0.35, 0.43, 0.45);
  const infoSize = 8;
  const xRight = x + width;
  let infoY = y - 12;
  if (infoY < 10) infoY = y + height + 26; // signature sits at the very bottom — put the info block above it instead

  drawLabelValue(page, { label: 'שם החותם', value: signerName, font, size: infoSize, xRight, y: infoY, color: ink });
  drawLabelValue(page, { label: 'נחתם (UTC)', value: signedAt, font, size: infoSize, xRight, y: infoY - 11, color: muted });
  drawLabelValue(page, { label: 'מזהה מסמך', value: docId, font, size: infoSize, xRight, y: infoY - 22, color: muted });

  // ── final audit page ──
  const auditPage = pdfDoc.addPage([595.28, 841.89]); // A4
  const M = 56;
  const right = 595.28 - M;
  let cy = 780;

  drawBidiText(auditPage, 'אישור חתימה אלקטרונית', { xRight: right, y: cy, size: 18, font: boldFont, color: ink });
  cy -= 34;

  const rows = [
    ['כותרת המסמך', title],
    ['מזהה מסמך', docId],
    ['שם החותם', signerName],
    ['תאריך ושעת החתימה (UTC)', signedAt],
    ['כתובת IP', ip || 'לא ידוע'],
    ['דפדפן/מכשיר', (userAgent || 'לא ידוע').slice(0, 70)],
  ];
  for (const [label, value] of rows) {
    drawLabelValue(auditPage, { label, value, font, size: 11, xRight: right, y: cy, color: ink });
    cy -= 22;
  }

  cy -= 20;
  const declarationLines = [
    'מסמך זה נחתם באמצעות חתימה אלקטרונית פשוטה, ולא באמצעות חתימה',
    'דיגיטלית מאושרת מבוססת תעודה אלקטרונית כהגדרתה בחוק חתימה',
    'אלקטרונית, תשס"א-2001. החתימה מהווה אישור להסכמת החותם לתוכן המסמך.'
  ];
  for (const line of declarationLines) {
    drawBidiText(auditPage, line, { font, size: 10, xRight: right, y: cy, color: muted });
    cy -= 16;
  }

  return pdfDoc.save();
}

module.exports = { embedSignature, drawBidiText, splitRuns };
