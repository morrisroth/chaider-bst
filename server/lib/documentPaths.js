const fs = require('fs');
const path = require('path');

const ORIGINALS_DIR = path.join(__dirname, '../documents/originals');
const SIGNED_DIR = path.join(__dirname, '../documents/signed');
const FONTS_DIR = path.join(__dirname, '../assets/fonts');

function ensureDirs() {
  fs.mkdirSync(ORIGINALS_DIR, { recursive: true });
  fs.mkdirSync(SIGNED_DIR, { recursive: true });
}

module.exports = { ORIGINALS_DIR, SIGNED_DIR, FONTS_DIR, ensureDirs };
