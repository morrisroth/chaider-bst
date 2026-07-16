// Per-key async mutex — serializes concurrent operations (e.g. two simultaneous
// sign submissions for the same document) within this single Node process.
const locks = new Map();

async function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const gate = prev.then(fn, fn);
  locks.set(key, gate);
  try {
    return await gate;
  } finally {
    if (locks.get(key) === gate) locks.delete(key);
  }
}

module.exports = { withLock };
