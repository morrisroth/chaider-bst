require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const { read } = require('./db');
const { ensureDirs } = require('./lib/documentPaths');
const { hashToken } = require('./lib/signToken');

ensureDirs();

const app = express();
app.set('trust proxy', 1); // exactly one hop: nginx terminates TLS and proxies straight to this app

app.use(cors());
app.disable('x-powered-by');
// Basic hardening headers on every response
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  // Admin pages must never be framed (clickjacking); public pages may be embedded
  if (req.path.startsWith('/admin')) res.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Small previews of uploads for gallery tiles, created on first request
app.get('/thumbs/:name', require('./lib/thumbs').serveThumb);

// Client-side libraries served straight from node_modules — no CDN, no build step
app.use('/vendor/pdfjs', express.static(path.join(__dirname, '../node_modules/pdfjs-dist/build')));
app.use('/vendor/pdfjs-cmaps', express.static(path.join(__dirname, '../node_modules/pdfjs-dist/cmaps')));
app.use('/vendor/signature_pad', express.static(path.join(__dirname, '../node_modules/signature_pad/dist')));

// Webhook: capture raw Buffer for HMAC verification, before express.json()
app.use('/webhook', express.raw({ type: '*/*' }), require('./routes/webhook'));

// Everything else uses JSON. Raised from Express's 100kb default — signing
// submissions carry base64 signature images (per field) and an optional
// base64 attachment (up to 8MB decoded) in the same JSON body.
app.use(express.json({ limit: '20mb' }));

// API routes
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/posts',    require('./routes/posts'));
app.use('/api/gallery',  require('./routes/gallery'));
app.use('/api/slider',   require('./routes/slider'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/contact',  require('./routes/contact'));
app.use('/api/register', require('./routes/register'));
app.use('/api/upload',   require('./routes/upload'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/sign',      require('./routes/sign'));

// ── Clean URLs ──
// Old *.html links still work but redirect (301) to the extensionless form,
// so bookmarks/shared links get canonicalized instead of breaking.
app.get(/\.html$/, (req, res) => {
  const clean = req.path === '/index.html' ? '/' : req.path.slice(0, -'.html'.length);
  const qs = req.url.slice(req.path.length);
  res.redirect(301, clean + qs);
});

app.get('/admin', (req, res) => res.redirect(302, '/admin/dashboard'));
// The approach page was removed — send old links/bookmarks to the about page
app.get(['/approach', '/approach.html'], (req, res) => res.redirect(301, '/about'));

// Link previews (WhatsApp, Facebook…) — crawlers need absolute URLs, so these
// are built from APP_URL rather than written into each page.
const SITE_URL = (process.env.APP_URL || '').replace(/\/+$/, '');
const PUBLIC_PAGES = ['/', '/about', '/news', '/gallery', '/contact', '/register', '/privacy', '/accessibility'];
function socialTags(html, pagePath) {
  const attr = s => String(s).replace(/&(?!\w+;|#\d+;)/g, '&amp;').replace(/"/g, '&quot;');
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || 'חיידר בעל שם טוב';
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  return [
    `<link rel="canonical" href="${SITE_URL}${pagePath}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="תלמוד תורה בעל שם טוב">',
    '<meta property="og:locale" content="he_IL">',
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${desc}">`,
    `<meta property="og:url" content="${SITE_URL}${pagePath}">`,
    `<meta property="og:image" content="${SITE_URL}/assets/og-image.png">`,
    '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
  ].join('\n');
}

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    'User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /sign/\n' +
    (SITE_URL ? `\nSitemap: ${SITE_URL}/sitemap.xml\n` : ''));
});
app.get('/sitemap.xml', (req, res) => {
  const urls = PUBLIC_PAGES.filter(p => p === '/' || fs.existsSync(path.join(__dirname, '..', p.slice(1) + '.html')))
    .map(p => `  <url><loc>${SITE_URL}${p}</loc></url>`).join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
});
app.get('/favicon.ico', (req, res) => res.redirect(301, '/assets/favicon-32.png'));

// Public pages, served at extensionless URLs — settings/gallery/posts are
// injected so everything loads instantly with no client-side flash.
app.get(/^\/(?!admin\/|api\/|uploads\/|vendor\/|sign\/)[a-zA-Z0-9\-_]*$/, (req, res, next) => {
  const slug = req.path === '/' ? 'index' : req.path.slice(1);
  const filePath = path.join(__dirname, '..', slug + '.html');
  if (!fs.existsSync(filePath)) return next();
  try {
    const settings = read('settings.json');
    const gallery  = read('gallery.json').sort((a, b) => (a.order || 0) - (b.order || 0));
    const posts    = read('posts.json').filter(p => p.published).sort((a, b) => new Date(b.date) - new Date(a.date));
    let html = fs.readFileSync(filePath, 'utf8');
    // "<" escaped so a caption/post containing "</script>" can't break out of the tag
    const js = v => JSON.stringify(v).replace(/</g, '\\u003c');
    const inject = `${socialTags(html, req.path)}
<script>
window.__BST__=${js(settings)};
window.__BST_GALLERY__=${js(gallery)};
window.__BST_POSTS__=${js(posts)};
</script>`;
    html = html.replace('</head>', inject + '\n</head>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch {
    next();
  }
});

// Admin pages, served at extensionless URLs (e.g. /admin/documents -> admin/documents.html)
app.get(/^\/admin\/[a-zA-Z0-9\-_]+$/, (req, res, next) => {
  const filePath = path.join(__dirname, '..', req.path + '.html');
  if (!fs.existsSync(filePath)) return next();
  res.sendFile(filePath);
});

// Public signing page — same static shell for both URL shapes, state is
// derived client-side from GET /api/sign/:token. The title/OG tags are
// injected server-side (rather than left to sign.js) so link-preview
// crawlers — which never run JS — show the real document title.
app.get(['/sign/:token', '/sign/:token/completed'], (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, '../sign.html'), 'utf8');
  try {
    const tokenHash = hashToken(req.params.token);
    const doc = read('documents.json').find(d => d.tokenHash === tokenHash);
    if (doc && doc.title) {
      const suffix = doc.title.includes('חיידר בעל שם טוב') ? '' : ' — חיידר בעל שם טוב';
      const pageTitle = `${doc.title}${suffix}`.replace(/"/g, '&quot;');
      html = html
        .replace(/<title>.*?<\/title>/, `<title>${pageTitle}</title>`)
        .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${pageTitle}$2`);
    }
  } catch (e) {
    console.error('Failed to inject document title into sign page:', e);
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Serve everything else (CSS, JS, images, admin pages) — but the project root
// also holds the server code, its data (registrations, ID scans, signed PDFs),
// .git and package files, none of which may ever be served.
const PRIVATE_PATH = /^\/(server|node_modules|\.git)(\/|$)|^\/[^/]*\.(json|md|sh|lock|log|env)$|\/\./i;
app.use((req, res, next) => {
  let p;
  try { p = decodeURIComponent(req.path).replace(/[\\/]+/g, '/'); } catch { return res.status(400).end(); }
  if (PRIVATE_PATH.test(p)) return res.status(404).send('Not found');
  next();
});
app.use(express.static(path.join(__dirname, '..'), { dotfiles: 'deny', index: false }));

// Unknown page → branded 404 (API calls keep a JSON 404)
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return res.status(404).json({ error: 'לא נמצא' });
  res.status(404).sendFile(path.join(__dirname, '../404.html'));
});

// Never leak stack traces, storage paths, or internal error details to clients
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'שגיאת שרת' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
