import { describe, it, expect } from 'vitest';
const { isPdfMagicBytes, isPngMagicBytes, isJpegMagicBytes } = require('../lib/pdfValidate');

describe('pdfValidate', () => {
  it('accepts a real PDF header', () => {
    expect(isPdfMagicBytes(Buffer.from('%PDF-1.4\n...'))).toBe(true);
  });

  it('rejects a PNG pretending to be a PDF', () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(isPdfMagicBytes(pngHeader)).toBe(false);
  });

  it('rejects an empty/too-short buffer', () => {
    expect(isPdfMagicBytes(Buffer.from('%PD'))).toBe(false);
  });

  it('accepts a real PNG header', () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(isPngMagicBytes(pngHeader)).toBe(true);
  });

  it('rejects a PDF pretending to be a PNG', () => {
    expect(isPngMagicBytes(Buffer.from('%PDF-1.4\n...'))).toBe(false);
  });

  it('rejects random garbage bytes', () => {
    expect(isPngMagicBytes(Buffer.from([1, 2, 3, 4]))).toBe(false);
  });

  it('accepts a real JPEG header', () => {
    expect(isJpegMagicBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe(true);
  });

  it('rejects a PNG pretending to be a JPEG', () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(isJpegMagicBytes(pngHeader)).toBe(false);
  });

  it('rejects a too-short buffer as a JPEG', () => {
    expect(isJpegMagicBytes(Buffer.from([0xff, 0xd8]))).toBe(false);
  });
});
