// HTTP header values must be ASCII — a Hebrew filename dropped in raw (or
// even just percent-encoded via encodeURIComponent) isn't valid
// Content-Disposition syntax and can throw when the response is sent.
// RFC 5987's filename* is the correct way to convey a UTF-8 filename; the
// plain filename= fallback (ASCII-only) is for the rare client that
// ignores filename*.
function contentDispositionAttachment(filename) {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

module.exports = { contentDispositionAttachment };
