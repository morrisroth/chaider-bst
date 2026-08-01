require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const { read } = require('./db');
const { ensureDirs } = require('./lib/documentPaths');

ensureDirs();

const app = express();
app.set('trust proxy', 1); // exactly one hop: nginx terminates TLS and proxies straight to this app

app.use(cors());
app.use(require('./middleware/visitors'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Client-side libraries served straight from node_modules — no CDN, no build step
app.use('/vendor/pdfjs', express.static(path.join(__dirname, '../node_modules/pdfjs-dist/build')));
app.use('/vendor/pdfjs-cmaps', express.static(path.join(__dirname, '../node_modules/pdfjs-dist/cmaps')));
app.use('/vendor/signature_pad', express.static(path.join(__dirname, '../node_modules/signature_pad/dist')));

// Webhook: capture raw Buffer for HMAC verification, before express.json()
app.use('/webhook', express.raw({ type: '*/*' }), require('./routes/webhook'));

// Everything else uses JSON
app.use(express.json());

// API routes
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/posts',    require('./routes/posts'));
app.use('/api/gallery',  require('./routes/gallery'));
app.use('/api/slider',   require('./routes/slider'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/contact',  require('./routes/contact'));
app.use('/api/register', require('./routes/register'));
app.use('/api/upload',   require('./routes/upload'));
app.use('/api/stats',    require('./routes/stats'));
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
    const inject = `<script>
window.__BST__=${JSON.stringify(settings)};
window.__BST_GALLERY__=${JSON.stringify(gallery)};
window.__BST_POSTS__=${JSON.stringify(posts)};
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
// derived client-side from GET /api/sign/:token
app.get(['/sign/:token', '/sign/:token/completed'], (req, res) => {
  res.sendFile(path.join(__dirname, '../sign.html'));
});

// Serve everything else (CSS, JS, images, admin pages)
app.use(express.static(path.join(__dirname, '..')));

// Never leak stack traces, storage paths, or internal error details to clients
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'שגיאת שרת' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
