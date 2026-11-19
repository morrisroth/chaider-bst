// Web-optimised copy of the homepage background video.
//
// Promo videos straight from a camera/editor are often 100MB+, which every
// visitor would have to download just to see the hero. The background plays
// muted, so the copy drops audio, caps the width at 1920px, re-encodes to
// H.264 at a moderate quality and moves the index to the front (faststart) so
// playback starts before the whole file has downloaded. Typically 10–20x smaller.

const { spawn } = require('child_process');

function heroVideoArgs(src, out) {
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', src,
    '-an',                                    // background video plays muted
    '-vf', 'scale=w=min(iw\\,1920):h=-2,fps=30',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
    '-pix_fmt', 'yuv420p',                    // plays in every browser
    '-movflags', '+faststart',
    out
  ];
}

function optimizeHeroVideo(src, out) {
  return new Promise((resolve, reject) => {
    const args = heroVideoArgs(src, out);
    // Lower priority on Linux so the site stays responsive while encoding
    const ff = process.platform === 'linux'
      ? spawn('nice', ['-n', '10', 'ffmpeg', ...args])
      : spawn('ffmpeg', args);
    let stderr = '';
    ff.stderr.on('data', d => { stderr += d; });
    ff.on('error', reject); // e.g. ffmpeg not installed
    ff.on('close', code => code === 0 ? resolve(out) : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`)));
  });
}

module.exports = { heroVideoArgs, optimizeHeroVideo };
