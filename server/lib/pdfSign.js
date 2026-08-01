const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const { FONTS_DIR } = require('./documentPaths');

// Reusable Hebrew/RTL-safe text-drawing utilities — used below by
// embedSignatures() to draw the auto-filled signing date.
//
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

// Embeds one or more PNG signatures into the document, one per configured
// field (e.g. father/mother), and optionally stamps the signing date as text
// into a separate field. Nothing else is drawn onto the page or appended to
// the PDF.
async function embedSignatures(pdfBytes, { fields, dateField, dateText }) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  for (const field of fields) {
    const pngImage = await pdfDoc.embedPng(field.pngBytes);
    const page = pdfDoc.getPage(field.page - 1);
    page.drawImage(pngImage, { x: field.x, y: field.y, width: field.width, height: field.height });
  }

  if (dateField && dateText) {
    pdfDoc.registerFontkit(fontkit);
    const fontBytes = fs.readFileSync(path.join(FONTS_DIR, 'Heebo-Regular.ttf'));
    const font = await pdfDoc.embedFont(fontBytes);
    const page = pdfDoc.getPage(dateField.page - 1);
    const size = Math.min(16, dateField.height * 0.6);
    const y = dateField.y + (dateField.height - size) / 2;
    drawBidiText(page, dateText, { font, size, y, xRight: dateField.x + dateField.width, color: rgb(0.08, 0.08, 0.08) });
  }

  return pdfDoc.save();
}

module.exports = { embedSignatures, drawBidiText, splitRuns };
