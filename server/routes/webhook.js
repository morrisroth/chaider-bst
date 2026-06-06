const router = require('express').Router();
const crypto = require('crypto');
const { execFile } = require('child_process');
const path = require('path');

const SECRET = process.env.WEBHOOK_SECRET || '';
const DEPLOY = path.join(__dirname, '../../deploy.sh');

function verify(req) {
  if (!SECRET) return true; // skip verification if no secret set
  const sig = req.headers['x-hub-signature-256'] || '';
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(req.rawBody || '').digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); } catch { return false; }
}

router.post('/', (req, res) => {
  if (!verify(req)) {
    console.log('[webhook] invalid signature');
    return res.status(401).json({ error: 'invalid signature' });
  }

  const event = req.headers['x-github-event'];
  const branch = req.body?.ref;

  if (event !== 'push' || !branch?.endsWith('/master')) {
    return res.json({ skipped: true, event, branch });
  }

  console.log('[webhook] push to master — deploying...');
  res.json({ ok: true, message: 'deploying' });

  execFile('bash', [DEPLOY], { cwd: path.join(__dirname, '../..') }, (err, stdout, stderr) => {
    if (err) console.error('[webhook] deploy error:', err.message);
    else console.log('[webhook] deployed:\n', stdout);
    if (stderr) console.error('[webhook] stderr:', stderr);
  });
});

module.exports = router;
