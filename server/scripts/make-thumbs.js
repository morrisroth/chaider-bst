// One-off: create gallery previews for every existing upload, so the first
// visitor after a deploy doesn't wait for them to be generated on demand.
//   node server/scripts/make-thumbs.js
// Safe to re-run — existing previews are skipped.
const path = require('path');
const { read } = require('../db');
const { ensureThumb } = require('../lib/thumbs');

(async () => {
  const urls = read('gallery.json')
    .map(i => (i.type === 'video' ? i.video : i.image))
    .filter(u => /^\/uploads\/[\w-]+\.\w+$/.test(u || ''));

  let ok = 0, failed = 0;
  for (const [n, url] of urls.entries()) {
    const name = path.basename(url) + '.jpg';
    try {
      if (await ensureThumb(name)) ok++;
      else { failed++; console.warn('missing upload:', url); }
    } catch (e) {
      failed++; console.warn('failed:', url, e.message);
    }
    if ((n + 1) % 25 === 0) console.log(`${n + 1}/${urls.length}`);
  }
  console.log(`done: ${ok} previews ready, ${failed} failed`);
})();
