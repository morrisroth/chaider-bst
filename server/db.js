const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

const DATA = path.join(__dirname, 'data');

function read(file) {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) return file === 'settings.json' ? {} : [];
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return file === 'settings.json' ? {} : []; }
}

function write(file, data) {
  fs.writeFileSync(path.join(DATA, file), JSON.stringify(data, null, 2));
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
