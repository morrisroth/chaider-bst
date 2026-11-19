import { describe, it, expect, afterAll } from 'vitest';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { ensureThumb, UPLOADS } = require('../lib/thumbs');

const NAME = `0000000000000-thumbtest.jpg`;
const SRC = path.join(UPLOADS, NAME);
const OUT = path.join(UPLOADS, 'thumbs', NAME + '.jpg');

afterAll(() => {
  for (const f of [SRC, OUT]) if (fs.existsSync(f)) fs.unlinkSync(f);
});

describe('gallery thumbnails', () => {
  it('shrinks a large photo to an 800px-wide JPEG', async () => {
    fs.mkdirSync(UPLOADS, { recursive: true });
    await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#3a7' } }).jpeg({ quality: 95 }).toFile(SRC);

    const out = await ensureThumb(NAME + '.jpg');
    expect(out).toBe(OUT);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
    expect(fs.statSync(out).size).toBeLessThan(fs.statSync(SRC).size);
  });

  it('reuses the saved preview on the next request', async () => {
    const before = fs.statSync(OUT).mtimeMs;
    await ensureThumb(NAME + '.jpg');
    expect(fs.statSync(OUT).mtimeMs).toBe(before);
  });

  it('returns null for an upload that does not exist', async () => {
    expect(await ensureThumb('9999999999999-nope.jpg.jpg')).toBeNull();
  });

  it('rejects names that are not upload previews (no path tricks)', async () => {
    for (const bad of ['../db.js.jpg', 'x.jpg', '..%2Fdata%2Fadmins.json.jpg', 'settings.json.jpg']) {
      expect(await ensureThumb(bad)).toBeNull();
    }
  });
});
