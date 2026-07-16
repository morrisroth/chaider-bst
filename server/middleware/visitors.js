const fs = require('fs');
const path = require('path');
const { getClientIp } = require('../lib/clientIp');

const FILE = path.join(__dirname, '../data/visitors.json');

function readData() {
  if (!fs.existsSync(FILE)) return {};
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
function writeData(d) { fs.writeFileSync(FILE, JSON.stringify(d)); }

function today() { return new Date().toISOString().slice(0, 10); }

// Search engine crawlers, AI crawlers, security scanners, and common HTTP
// client libraries all self-identify in their User-Agent — this catches the
// large majority of non-human traffic without needing anything fancier.
const BOT_UA = /bot|crawl|spider|slurp|curl|wget|python-requests|scrapy|headless|phantom|selenium|puppeteer|playwright|censys|shodan|masscan|nmap|zgrab|go-http-client|libwww|lighthouse|pingdom|uptimerobot|facebookexternalhit|whatsapp|telegrambot|discordbot|slackbot|monitor|semrush|ahrefs|mj12bot|dotbot/i;

// Paths that are only ever hit by bots/scanners probing for standard files —
// never a real page a visitor navigated to.
const BOT_PROBE_PATHS = new Set(['/robots.txt', '/favicon.ico']);

function looksLikeBot(req) {
  const ua = req.headers['user-agent'];
  if (!ua) return true; // real browsers always send a User-Agent
  if (BOT_UA.test(ua)) return true;
  if (BOT_PROBE_PATHS.has(req.path)) return true;
  return false;
}

// Express middleware — records unique IPs per day for public HTML pages
module.exports = function trackVisitors(req, res, next) {
  // Only count GET requests to public HTML pages (not API, not admin, not assets)
  const skip =
    req.method !== 'GET' ||
    req.path.startsWith('/api/') ||
    req.path.startsWith('/admin/') ||
    req.path.startsWith('/uploads/') ||
    /\.(css|js|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|mp4|mov)$/i.test(req.path) ||
    looksLikeBot(req);

  if (skip) return next();

  const ip = getClientIp(req);
  const date = today();
  const data = readData();

  if (!data[date]) data[date] = [];
  if (!data[date].includes(ip)) {
    data[date].push(ip);
    writeData(data);
  }

  next();
};

// Stats helper — used by the stats route
module.exports.getStats = function() {
  const data = readData();
  const dates = Object.keys(data).sort();

  // All-time unique IPs
  const allIPs = new Set();
  dates.forEach(d => data[d].forEach(ip => allIPs.add(ip)));

  // Last 30 days
  const last30 = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    last30.push({ date: key, count: (data[key] || []).length });
  }

  // Totals
  const todayKey = today();
  const todayCount = (data[todayKey] || []).length;

  const weekTotal = last30.slice(-7).reduce((s, d) => s + d.count, 0);
  const monthTotal = last30.reduce((s, d) => s + d.count, 0);

  // Unique this week / month (deduplicated across days)
  const weekDates  = last30.slice(-7).map(d => d.date);
  const monthDates = last30.map(d => d.date);
  const weekIPs  = new Set(weekDates.flatMap(d => data[d] || []));
  const monthIPs = new Set(monthDates.flatMap(d => data[d] || []));

  return {
    total:    allIPs.size,
    today:    todayCount,
    week:     weekIPs.size,
    month:    monthIPs.size,
    last30,
    topDays: [...dates]
      .sort((a, b) => (data[b]?.length || 0) - (data[a]?.length || 0))
      .slice(0, 5)
      .map(d => ({ date: d, count: data[d].length }))
  };
};
