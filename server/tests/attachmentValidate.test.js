import { describe, it, expect } from 'vitest';
const { decodeAttachment } = require('../lib/attachmentValidate');

const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const TINY_JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]).toString('base64');
const TINY_PDF_B64 = Buffer.from('%PDF-1.4\n%%EOF').toString('base64');

describe('decodeAttachment', () => {
  it('accepts a PNG data URL and identifies it correctly', () => {
    const result = decodeAttachment(`data:image/png;base64,${TINY_PNG_B64}`);
    expect(result.error).toBeUndefined();
    expect(result.ext).toBe('png');
    expect(result.contentType).toBe('image/png');
  });

  it('accepts a JPEG data URL and identifies it correctly', () => {
    const result = decodeAttachment(`data:image/jpeg;base64,${TINY_JPEG_B64}`);
    expect(result.error).toBeUndefined();
    expect(result.ext).toBe('jpg');
    expect(result.contentType).toBe('image/jpeg');
  });

  it('accepts a PDF data URL and identifies it correctly', () => {
    const result = decodeAttachment(`data:application/pdf;base64,${TINY_PDF_B64}`);
    expect(result.error).toBeUndefined();
    expect(result.ext).toBe('pdf');
    expect(result.contentType).toBe('application/pdf');
  });

  it('determines the type from actual file bytes, not the declared MIME type', () => {
    // Claims to be a PDF but is actually PNG bytes — must be identified as PNG
    const result = decodeAttachment(`data:application/pdf;base64,${TINY_PNG_B64}`);
    expect(result.ext).toBe('png');
  });

  it('rejects a non-data-URL string', () => {
    expect(decodeAttachment('not-a-data-url').error).toBeTruthy();
  });

  it('rejects an empty/missing value', () => {
    expect(decodeAttachment(undefined).error).toBeTruthy();
    expect(decodeAttachment('').error).toBeTruthy();
  });

  it('rejects a file type that is neither image nor PDF', () => {
    const randomBytes = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]).toString('base64');
    expect(decodeAttachment(`data:application/octet-stream;base64,${randomBytes}`).error).toBeTruthy();
  });

  it('rejects a file over the 8MB size cap', () => {
    const bigBuffer = Buffer.alloc(9 * 1024 * 1024, 0);
    bigBuffer[0] = 0xff; bigBuffer[1] = 0xd8; bigBuffer[2] = 0xff; // valid JPEG header, oversized body
    const result = decodeAttachment(`data:image/jpeg;base64,${bigBuffer.toString('base64')}`);
    expect(result.error).toBeTruthy();
  });
});
