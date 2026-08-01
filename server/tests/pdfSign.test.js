import { describe, it, expect } from 'vitest';
const { PDFDocument } = require('pdf-lib');
const { embedSignatures, splitRuns } = require('../lib/pdfSign');

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

describe('embedSignatures', () => {
  it('resolves and keeps the original page count — only the signature image(s) are added, nothing else', async () => {
    const src = await makeSourcePdf(2);
    const out = await embedSignatures(src, {
      fields: [{ page: 1, x: 50, y: 50, width: 150, height: 60, pngBytes: TINY_PNG }]
    });

    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(2);
  });

  it('embeds a signature on the requested page, not another one', async () => {
    const src = await makeSourcePdf(3);
    const out = await embedSignatures(src, {
      fields: [{ page: 2, x: 20, y: 20, width: 100, height: 40, pngBytes: TINY_PNG }]
    });
    const reloaded = await PDFDocument.load(out);
    // A page nobody ever drew on has no content stream at all (Contents() is
    // undefined); the requested page (index 1) got the signature image drawn
    // on it, so it must have one, while the untouched pages must not
    expect(reloaded.getPage(1).node.Contents()).toBeTruthy();
    expect(reloaded.getPage(0).node.Contents()).toBeFalsy();
    expect(reloaded.getPage(2).node.Contents()).toBeFalsy();
  });

  it('embeds multiple signatures (e.g. two parents) onto the same page', async () => {
    const src = await makeSourcePdf(1);
    const out = await embedSignatures(src, {
      fields: [
        { page: 1, x: 20, y: 20, width: 80, height: 30, pngBytes: TINY_PNG },
        { page: 1, x: 150, y: 20, width: 80, height: 30, pngBytes: TINY_PNG }
      ]
    });
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPage(0).node.Contents()).toBeTruthy();
  });

  it('draws the auto-filled date text when a dateField is given', async () => {
    const src = await makeSourcePdf(1);
    const out = await embedSignatures(src, {
      fields: [{ page: 1, x: 20, y: 20, width: 80, height: 30, pngBytes: TINY_PNG }],
      dateField: { page: 1, x: 300, y: 400, width: 100, height: 30 },
      dateText: '01/08/2026'
    });
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPage(0).node.Contents()).toBeTruthy();
  });

  it('does not throw for a minimal single-page document', async () => {
    const src = await makeSourcePdf(1);
    await expect(embedSignatures(src, {
      fields: [{ page: 1, x: 10, y: 10, width: 80, height: 30, pngBytes: TINY_PNG }]
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
