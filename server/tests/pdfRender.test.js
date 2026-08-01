import { describe, it, expect } from 'vitest';
const { PDFDocument } = require('pdf-lib');
const { renderPageToPng } = require('../lib/pdfRender');

async function makeSourcePdf(pageCount = 2) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([595, 842]);
  return doc.save();
}

describe('renderPageToPng', () => {
  it('renders a requested page to a valid PNG buffer', async () => {
    const src = await makeSourcePdf(2);
    const png = await renderPageToPng(Buffer.from(src), 1);
    // PNG magic bytes
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('accepts a Node Buffer, not just a Uint8Array', async () => {
    const src = await makeSourcePdf(1);
    await expect(renderPageToPng(Buffer.from(src), 1)).resolves.toBeInstanceOf(Buffer);
  });

  it('rejects a page number beyond the document', async () => {
    const src = await makeSourcePdf(1);
    await expect(renderPageToPng(Buffer.from(src), 2)).rejects.toThrow();
  });

  it('rejects page 0 (pages are 1-indexed)', async () => {
    const src = await makeSourcePdf(2);
    await expect(renderPageToPng(Buffer.from(src), 0)).rejects.toThrow();
  });
});
