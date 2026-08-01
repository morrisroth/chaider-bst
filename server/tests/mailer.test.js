import { describe, it, expect } from 'vitest';
const { buildSignedDocumentMail } = require('../lib/mailer');

const TINY_PDF = Buffer.from('%PDF-1.4 fake');

describe('buildSignedDocumentMail', () => {
  it('addresses the mail to the signer and includes the document title in the subject', () => {
    const mail = buildSignedDocumentMail({
      to: 'parent@example.com', studentName: 'ישראל ישראלי',
      documentTitle: 'תקנון חיידר', pdfBytes: TINY_PDF, pdfFilename: 'תקנון.pdf'
    });
    expect(mail.to).toBe('parent@example.com');
    expect(mail.subject).toContain('תקנון חיידר');
  });

  it('sends from the institution mailbox with a friendly display name', () => {
    const mail = buildSignedDocumentMail({
      to: 'a@b.com', studentName: 'x', documentTitle: 'y', pdfBytes: TINY_PDF, pdfFilename: 'y.pdf'
    });
    expect(mail.from).toContain('חיידר בעל שם טוב');
    expect(mail.from.toLowerCase()).toContain('chaiderbs@netzach.org.il');
  });

  it('attaches the signed PDF bytes under the given filename', () => {
    const mail = buildSignedDocumentMail({
      to: 'a@b.com', studentName: 'x', documentTitle: 'y', pdfBytes: TINY_PDF, pdfFilename: 'signed-copy.pdf'
    });
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0].filename).toBe('signed-copy.pdf');
    expect(mail.attachments[0].content).toBe(TINY_PDF);
    expect(mail.attachments[0].contentType).toBe('application/pdf');
  });

  it('mentions the student name in the Hebrew body when one is given', () => {
    const mail = buildSignedDocumentMail({
      to: 'a@b.com', studentName: 'שרה כהן', documentTitle: 'מסמך',
      pdfBytes: TINY_PDF, pdfFilename: 'מסמך.pdf'
    });
    expect(mail.html).toContain('שרה כהן');
    expect(mail.text).toContain('שרה כהן');
  });

  it('still produces a valid mail when no student name is given', () => {
    const mail = buildSignedDocumentMail({
      to: 'a@b.com', studentName: '', documentTitle: 'מסמך', pdfBytes: TINY_PDF, pdfFilename: 'מסמך.pdf'
    });
    expect(mail.html).toContain('מסמך');
    expect(mail.to).toBe('a@b.com');
  });
});
