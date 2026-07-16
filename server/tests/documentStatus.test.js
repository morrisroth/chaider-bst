import { describe, it, expect } from 'vitest';
const { getEffectiveStatus } = require('../lib/documentStatus');

const NOW = new Date('2026-07-16T12:00:00.000Z');
const future = '2026-08-01T00:00:00.000Z';
const past = '2026-07-01T00:00:00.000Z';

describe('getEffectiveStatus', () => {
  it('returns not-found for a missing document', () => {
    expect(getEffectiveStatus(null, NOW)).toBe('not-found');
  });

  it('returns revoked regardless of expiry', () => {
    expect(getEffectiveStatus({ status: 'revoked', expiresAt: future }, NOW)).toBe('revoked');
  });

  it('returns expired when past expiresAt, even if stored status is still pending', () => {
    expect(getEffectiveStatus({ status: 'pending', expiresAt: past }, NOW)).toBe('expired');
  });

  it('returns pending for a fresh, unopened link', () => {
    expect(getEffectiveStatus({ status: 'pending', expiresAt: future }, NOW)).toBe('pending');
  });

  it('returns pending when there is no expiry set', () => {
    expect(getEffectiveStatus({ status: 'pending', expiresAt: null }, NOW)).toBe('pending');
  });

  it('returns opened for a previously-opened, still-valid link', () => {
    expect(getEffectiveStatus({ status: 'opened', expiresAt: future }, NOW)).toBe('opened');
  });

  it('stays opened (not a terminal "signed" state) even after signatures have been collected', () => {
    // The document-level status has no notion of "signed" — a link can keep
    // collecting signatures from multiple people until revoked or expired.
    expect(getEffectiveStatus({ status: 'opened', expiresAt: future }, NOW)).toBe('opened');
  });
});
