// Small preview images for uploaded photos and videos.
//
// The gallery shows hundreds of tiles; loading each one from the original
// upload (often 2–10 MB phone photos, or a whole video file just to show its
// first frame) made the gallery page slow. Instead, every upload gets a
// ~600px JPEG preview, served at /thumbs/<upload filename>.jpg and created on
// first request, then kept on disk under uploads/thumbs/.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const sharp = require('sharp');

const UPLOADS = path.join(__dirname, '../uploads');
const THUMBS = path.join(UPLOADS, 'thumbs');
const WIDTH = 800; // wide tiles span two columns (~780px) on desktop

const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;
// /thumbs/<upload filename>.jpg — upload filenames are `${Date.now()}-${random}${ext}`
const THUMB_NAME = /^([\w-]+\.(?:jpe?g|png|gif|webp|mp4|mov|m4v|webm|mkv|avi))\.jpg$/i;

sharp.concurrency(1); // keep CPU use modest on the shared server

function sourceFor(thumbName) {
  const m = THUMB_NAME.exec(thumbName);
  if (!m) return null;
  const src = path.join(UPLOADS, m[1]);
  return fs.existsSync(src) ? src : null;
}

function toJpeg(input) {
  return sharp(input, { failOn: 'none' })
    .rotate() // apply the phone's EXIF orientation before it is stripped
    .resize({ width: WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
}

// First frame (~0.5s in, past any black fade-in) of a video, as a PNG buffer.
function videoFrame(src) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-ss', '0.5', '-i', src,
      '-frames:v', '1', '-vf', `scale=${WIDTH}:-2`,
      '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'
    ]);
    const chunks = [];
    ff.stdout.on('data', c => chunks.push(c));
    ff.on('error', reject); // e.g. ffmpeg not installed
    ff.on('close', code => {
      const buf = Buffer.concat(chunks);
      code === 0 && buf.length ? resolve(buf) : reject(new Error(`ffmpeg exited ${code}`));
    });
  });
}

const inFlight = new Map(); // thumbName -> Promise<path>, so parallel requests share one job

// Returns the path of the thumbnail file, creating it if needed; null if
// there is no such upload.
function ensureThumb(thumbName) {
  const out = path.join(THUMBS, thumbName);
  if (fs.existsSync(out)) return Promise.resolve(out);
  const src = sourceFor(thumbName);
  if (!src) return Promise.resolve(null);
  if (inFlight.has(thumbName)) return inFlight.get(thumbName);

  const job = (async () => {
    const input = VIDEO_EXT.test(src) ? await videoFrame(src) : src;
    const jpeg = await toJpeg(input);
    fs.mkdirSync(THUMBS, { recursive: true });
    const tmp = `${out}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, jpeg);
    fs.renameSync(tmp, out); // atomic: never serve a half-written file
    return out;
  })().finally(() => inFlight.delete(thumbName));

  inFlight.set(thumbName, job);
  return job;
}

// Express handler for GET /thumbs/:name
async function serveThumb(req, res) {
  const name = path.basename(req.params.name);
  try {
    const file = await ensureThumb(name);
    if (!file) return res.status(404).end();
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.sendFile(file);
  } catch (e) {
    console.error('thumbnail failed:', name, e.message);
    // Fall back to the original upload so the tile still shows something
    const m = THUMB_NAME.exec(name);
    if (m && IMAGE_EXT.test(m[1])) return res.redirect(302, `/uploads/${m[1]}`);
    res.status(404).end();
  }
}

module.exports = { ensureThumb, serveThumb, IMAGE_EXT, VIDEO_EXT, UPLOADS };
