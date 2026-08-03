import { describe, it, expect } from 'vitest';
const { contentDispositionAttachment } = require('../lib/contentDisposition');

describe('contentDispositionAttachment', () => {
  it('produces a header value containing only ASCII bytes for a Hebrew filename', () => {
    const header = contentDispositionAttachment('תקנון חיידר-ישראל כהן-אסמכתא.pdf');
    // eslint-disable-next-line no-control-regex
    expect(/^[\x00-\x7F]*$/.test(header)).toBe(true);
  });

  it('includes an RFC 5987 filename* with the correctly percent-encoded UTF-8 name', () => {
    const header = contentDispositionAttachment('א.pdf');
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent('א.pdf')}`);
  });

  it('includes a plain ASCII-safe filename= fallback', () => {
    const header = contentDispositionAttachment('תקנון.pdf');
    expect(header).toMatch(/filename="[^"]*"/);
  });

  it('leaves a pure-ASCII filename basically untouched in the fallback', () => {
    const header = contentDispositionAttachment('report.pdf');
    expect(header).toContain('filename="report.pdf"');
  });
});
