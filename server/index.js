require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const { read } = require('./db');

const app = express();

app.use(cors());
app.use(require('./middleware/visitors'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

// Inject settings into public HTML pages so images load instantly (no API round-trip)
app.get(/^\/(?!admin\/|uploads\/).*\.html$/, (req, res, next) => {
  const filePath = path.join(__dirname, '..', req.path);
  if (!fs.existsSync(filePath)) return next();
  try {
    const settings = read('settings.json');
    let html = fs.readFileSync(filePath, 'utf8');
    const inject = `<script>window.__BST__=${JSON.stringify(settings)}</script>`;
    html = html.replace('</head>', inject + '\n</head>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch {
    next();
  }
});

// Serve everything else (CSS, JS, images, admin pages)
app.use(express.static(path.join(__dirname, '..')));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
