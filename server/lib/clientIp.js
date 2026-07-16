// The site sits behind exactly one reverse proxy (nginx), which appends the
// real client IP as the LAST entry of X-Forwarded-For (see `proxy_set_header
// X-Forwarded-For $proxy_add_x_forwarded_for` in the nginx config). Any
// earlier entries in that header come from the client itself and are
// trivially spoofable — trusting the FIRST entry (a common mistake) lets
// anyone fake their recorded IP by just sending their own X-Forwarded-For
// header, which also inflates visitor counts (same bot varying the header
// looks like many different "unique" visitors).
function getClientIp(req) {
  const fw = req.headers['x-forwarded-for'];
  if (fw) {
    const parts = fw.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.socket?.remoteAddress || 'unknown';
}

module.exports = { getClientIp };
