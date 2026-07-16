import { describe, it, expect, beforeEach, afterEach } from 'vitest';
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/visitors.json');
let originalContent = null;

beforeEach(() => {
  originalContent = fs.existsSync(DATA_FILE) ? fs.readFileSync(DATA_FILE, 'utf8') : null;
  fs.writeFileSync(DATA_FILE, '{}');
  delete require.cache[require.resolve('../middleware/visitors')];
});

afterEach(() => {
  if (originalContent !== null) fs.writeFileSync(DATA_FILE, originalContent);
  else fs.existsSync(DATA_FILE) && fs.unlinkSync(DATA_FILE);
});

function fakeReqRes(path, userAgent, ip = '203.0.113.9') {
  const req = { method: 'GET', path, headers: userAgent ? { 'user-agent': userAgent } : {}, socket: { remoteAddress: ip } };
  const res = {};
  return { req, res };
}

function countedToday() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  return (data[today] || []).length;
}

describe('visitor bot filtering', () => {
  it('counts a normal browser visit to a real page', () => {
    const trackVisitors = require('../middleware/visitors');
    const { req, res } = fakeReqRes('/about', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    trackVisitors(req, res, () => {});
    expect(countedToday()).toBe(1);
  });

  it('does not count requests with no User-Agent at all', () => {
    const trackVisitors = require('../middleware/visitors');
    const { req, res } = fakeReqRes('/about', undefined);
    trackVisitors(req, res, () => {});
    expect(countedToday()).toBe(0);
  });

  it('does not count self-identifying crawlers (GPTBot, ClaudeBot, etc.)', () => {
    const trackVisitors = require('../middleware/visitors');
    const bots = [
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.4; +https://openai.com/gptbot)',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
      'Mozilla/5.0 (compatible; CensysInspect/1.1; +https://about.censys.io/)',
      'curl/7.74.0',
    ];
    for (const ua of bots) {
      const { req, res } = fakeReqRes('/', ua);
      trackVisitors(req, res, () => {});
    }
    expect(countedToday()).toBe(0);
  });

  it('does not count requests to bot-probe paths like /robots.txt or /favicon.ico', () => {
    const trackVisitors = require('../middleware/visitors');
    const normalUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
    const { req: r1, res: s1 } = fakeReqRes('/robots.txt', normalUA);
    trackVisitors(r1, s1, () => {});
    const { req: r2, res: s2 } = fakeReqRes('/favicon.ico', normalUA);
    trackVisitors(r2, s2, () => {});
    expect(countedToday()).toBe(0);
  });
});
