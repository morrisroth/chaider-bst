function isPdfMagicBytes(buffer) {
  return buffer.length >= 5 && buffer.slice(0, 5).toString('ascii') === '%PDF-';
}

function isPngMagicBytes(buffer) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return buffer.length >= sig.length && buffer.slice(0, sig.length).equals(sig);
}

module.exports = { isPdfMagicBytes, isPngMagicBytes };
