import { describe, it, expect } from 'vitest';
const { generateToken, hashToken } = require('../lib/signToken');

describe('signToken', () => {
  it('generates a 64-char hex token', () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates different tokens on each call', () => {
    expect(generateToken()).not.toBe(generateToken());
  });

  it('hashes deterministically', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('produces different hashes for different tokens', () => {
    expect(hashToken(generateToken())).not.toBe(hashToken(generateToken()));
  });

  it('never stores the raw token as the hash', () => {
    const token = generateToken();
    expect(hashToken(token)).not.toBe(token);
  });
});
