import { describe, it, expect } from 'vitest';
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const { embedSignature, splitRuns } = require('../lib/pdfSign');
const { FONTS_DIR } = require('../lib/documentPaths');

// A minimal 1x1 transparent PNG
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

async function makeSourcePdf(pageCount = 2) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([595, 842]);
  return doc.save();
}

describe('embedSignature', () => {
  it('resolves and produces a PDF with one extra (audit) page', async () => {
    const src = await makeSourcePdf(2);
    const out = await embedSignature(src, {
      page: 1, x: 50, y: 50, width: 150, height: 60, pngBytes: TINY_PNG,
      signerName: 'בדיקה', signedAt: new Date().toISOString(), docId: 'doc-123', title: 'מסמך בדיקה',
      ip: '127.0.0.1', userAgent: 'vitest',
      fontBytes: fs.readFileSync(path.join(FONTS_DIR, 'Heebo-Regular.ttf')),
      fontBoldBytes: fs.readFileSync(path.join(FONTS_DIR, 'Heebo-Bold.ttf'))
    });

    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(3); // 2 original + 1 audit page
  });

  it('embeds the signature on the requested page, not another one', async () => {
    const src = await makeSourcePdf(3);
    const out = await embedSignature(src, {
      page: 2, x: 20, y: 20, width: 100, height: 40, pngBytes: TINY_PNG,
      signerName: 'Test', signedAt: new Date().toISOString(), docId: 'doc-456', title: 'Doc',
      ip: '::1', userAgent: 'vitest',
      fontBytes: fs.readFileSync(path.join(FONTS_DIR, 'Heebo-Regular.ttf')),
      fontBoldBytes: fs.readFileSync(path.join(FONTS_DIR, 'Heebo-Bold.ttf'))
    });
    const reloaded = await PDFDocument.load(out);
    // A page nobody ever drew on has no content stream at all (Contents() is
    // undefined); the requested page (index 1) got an image + text drawn on
    // it, so it must have one, while the untouched pages must not
    expect(reloaded.getPage(1).node.Contents()).toBeTruthy();
    expect(reloaded.getPage(0).node.Contents()).toBeFalsy();
    expect(reloaded.getPage(2).node.Contents()).toBeFalsy();
  });

  it('does not throw on an empty signer name or missing user agent', async () => {
    const src = await makeSourcePdf(1);
    await expect(embedSignature(src, {
      page: 1, x: 10, y: 10, width: 80, height: 30, pngBytes: TINY_PNG,
      signerName: '', signedAt: new Date().toISOString(), docId: 'doc-789', title: 'Doc',
      ip: '', userAgent: '',
      fontBytes: fs.readFileSync(path.join(FONTS_DIR, 'Heebo-Regular.ttf')),
      fontBoldBytes: fs.readFileSync(path.join(FONTS_DIR, 'Heebo-Bold.ttf'))
    })).resolves.toBeTruthy();
  });
});

describe('splitRuns (bidi run splitting)', () => {
  it('keeps a single Hebrew word as one run (splits on the space between words)', () => {
    expect(splitRuns('שלום עולם')).toEqual(['שלום', ' ', 'עולם']);
  });

  it('keeps a pure-Latin/digit string as a single run', () => {
    expect(splitRuns('IP: 2001')).toEqual(['IP: 2001']);
  });

  it('splits mixed Hebrew+Latin text into separate runs, preserving each run intact', () => {
    const runs = splitRuns('כתובת IP: ::1');
    expect(runs).toEqual(['כתובת', ' IP: ::1']);
  });

  it('keeps a digit run intact and un-split from surrounding punctuation', () => {
    const runs = splitRuns('א-2001.');
    // the digits must appear together, undisturbed, within a single run
    const digitsRun = runs.find(r => r.includes('2001'));
    expect(digitsRun).toContain('2001');
  });
});
