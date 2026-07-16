import { describe, it, expect } from 'vitest';
const { getClientIp } = require('../lib/clientIp');

function fakeReq(xff, remoteAddress = '10.0.0.1') {
  return { headers: xff ? { 'x-forwarded-for': xff } : {}, socket: { remoteAddress } };
}

describe('getClientIp', () => {
  it('uses the LAST entry of X-Forwarded-For (the reverse proxy\'s own appended value)', () => {
    // nginx appends the real client IP after any client-supplied value(s)
    expect(getClientIp(fakeReq('203.0.113.5'))).toBe('203.0.113.5');
    expect(getClientIp(fakeReq('9.9.9.9, 203.0.113.5'))).toBe('203.0.113.5');
  });

  it('is not fooled by a client-spoofed leading entry once nginx appends the real one', () => {
    // A malicious client can send its own X-Forwarded-For header, but nginx
    // (proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for) appends
    // the real IP after it — the spoofed leading entry must NOT be returned.
    const spoofedThenReal = fakeReq('9.9.9.9, 203.0.113.5');
    expect(getClientIp(spoofedThenReal)).toBe('203.0.113.5');
    expect(getClientIp(spoofedThenReal)).not.toBe('9.9.9.9');
  });

  it('falls back to the socket address when there is no X-Forwarded-For', () => {
    expect(getClientIp(fakeReq(null, '198.51.100.7'))).toBe('198.51.100.7');
  });

  it('returns "unknown" when neither is available', () => {
    expect(getClientIp({ headers: {}, socket: {} })).toBe('unknown');
  });
});
