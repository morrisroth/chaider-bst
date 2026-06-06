const router = require('express').Router();
const crypto = require('crypto');
const { execFile } = require('child_process');
const path = require('path');

const SECRET = process.env.WEBHOOK_SECRET || '';
const DEPLOY = path.join(__dirname, '../../deploy.sh');

function verify(rawBody, sig) {
  if (!SECRET) return true;
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); } catch { return false; }
}

router.post('/', (req, res) => {
  // req.body is a Buffer from express.raw()
  const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(String(req.body));
  const sig = req.headers['x-hub-signature-256'] || '';

  if (!verify(rawBody, sig)) {
    console.log('[webhook] invalid signature');
    return res.status(401).json({ error: 'invalid signature' });
  }

  let payload = {};
  try { payload = JSON.parse(rawBody.toString('utf8')); } catch {}

  const event = req.headers['x-github-event'];
  const branch = payload.ref || '';

  if (event !== 'push' || !branch.endsWith('/master')) {
    return res.json({ skipped: true, event, branch });
  }

  console.log(`[webhook] push to master by ${payload.pusher?.name} — deploying...`);
  res.json({ ok: true, message: 'deploying' });

  execFile('bash', [DEPLOY], { cwd: path.join(__dirname, '../..') }, (err, stdout, stderr) => {
    if (err) console.error('[webhook] deploy error:', err.message, stderr);
    else console.log('[webhook] deployed:\n' + stdout.trim());
  });
});

module.exports = router;
