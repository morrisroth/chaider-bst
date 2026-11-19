const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

const DATA = path.join(__dirname, 'data');

function read(file) {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) return file === 'settings.json' ? {} : [];
  const raw = fs.readFileSync(p, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    // Never fall back to an empty list here: the next write() would replace
    // every record in the file with just the new one. Fail loudly instead —
    // the nightly backup (scripts/backup.sh) has the last good copy.
    console.error(`[db] ${file} is not valid JSON (${raw.length} bytes) — refusing to treat it as empty`);
    throw new Error(`Data file ${file} is corrupt`);
  }
}

// Write to a temp file and rename over the original, so a crash or a full disk
// mid-write can never leave a truncated file behind (rename is atomic).
function write(file, data) {
  const p = path.join(DATA, file);
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
}

// ── seed default admin ──
(function seed() {
  let admins = read('admins.json');
  if (!admins.length) {
    admins.push({ id: uuid(), username: 'admin', email: 'admin@chaider-bst.co.il', password_hash: bcrypt.hashSync('admin123', 10) });
    write('admins.json', admins);
  }
  let settings = read('settings.json');
  if (!settings.site_name) {
    write('settings.json', {
      site_name: 'חיידר בעל שם טוב',
      site_tagline: 'רמה ד\' · בית שמש',
      hero_title: 'חינוך שזורם מן הלב, בשמחה',
      hero_subtitle: 'חיידר חסידי בלב רמה ד\' בבית שמש — מרחב חינוכי מעודן שבו לימוד מעמיק נפגש באהבה, ברוגע ובליווי אישי לכל ילד וילד.',
      hero_image: '',
      about_image: '',
      about_text: 'חיידר בעל שם טוב ממוקם בלב שכונת רמה ד\' בבית שמש, ומחנך דורות של ילדים בדרך החסידות, התורה והשמחה.',
      logo_url: '',
      approach_image: '',
      phone: '052-2433693',
      address: 'רחוב המנונא 12, בית שמש',
      email: ''
    });
  }
})();

module.exports = { read, write, uuid };
