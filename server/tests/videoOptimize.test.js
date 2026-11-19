import { describe, it, expect } from 'vitest';
const { heroVideoArgs } = require('../lib/videoOptimize');

describe('heroVideoArgs', () => {
  const args = heroVideoArgs('/in/promo.mov', '/out/promo-web.mp4');

  it('reads the source and writes the output last', () => {
    expect(args[args.indexOf('-i') + 1]).toBe('/in/promo.mov');
    expect(args[args.length - 1]).toBe('/out/promo-web.mp4');
  });

  it('drops audio and makes a browser-friendly, fast-starting H.264 file', () => {
    expect(args).toContain('-an');
    expect(args[args.indexOf('-c:v') + 1]).toBe('libx264');
    expect(args[args.indexOf('-pix_fmt') + 1]).toBe('yuv420p');
    expect(args[args.indexOf('-movflags') + 1]).toBe('+faststart');
  });

  it('caps the width at 1920px without upscaling smaller videos', () => {
    expect(args[args.indexOf('-vf') + 1]).toContain('min(iw\\,1920)');
  });
});
