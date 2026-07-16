/* Shared admin utilities */
const API = '/api';

function getToken() { return localStorage.getItem('bst_token'); }
function getUser()  { return localStorage.getItem('bst_user'); }

function requireAuth() {
  if (!getToken()) { window.location.href = '/admin/login'; }
}

function logout() {
  localStorage.removeItem('bst_token');
  localStorage.removeItem('bst_user');
  window.location.href = '/admin/login';
}

async function api(method, path, body, isForm = false) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${getToken()}` }
  };
  if (body && !isForm) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body && isForm) {
    opts.body = body; // FormData
  }
  const res = await fetch(API + path, opts);
  if (res.status === 401) { logout(); return; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'שגיאה');
  return data;
}

async function uploadFile(file, isVideo = false) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(API + (isVideo ? '/upload/video' : '/upload'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: fd
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'שגיאת העלאה');
  return data.url;
}

async function uploadDocument(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(API + '/documents/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: fd
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'שגיאת העלאה');
  return data; // { file, pageCount }
}

// navigator.clipboard only exists in "secure contexts" (HTTPS/localhost) —
// on a plain-HTTP site it's undefined, so writeText() would throw. Fall back
// to the older execCommand('copy') approach via a temporary textarea.
function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      ok ? resolve() : reject(new Error('copy failed'));
    } catch (e) {
      document.body.removeChild(textarea);
      reject(e);
    }
  });
}

function showAlert(el, msg, type = 'success') {
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Render sidebar active state
function markActive() {
  const page = location.pathname.split('/').pop();
  document.querySelectorAll('.sidebar-nav a').forEach(a => {
    const href = a.getAttribute('href').split('/').pop();
    if (href === page) a.classList.add('active');
  });
}

// Render logged-in user
function renderUser() {
  const el = document.getElementById('admin-username');
  if (el) el.textContent = getUser() || 'מנהל';
}

// Inject logo into admin sidebar if one is set
async function loadAdminLogo() {
  try {
    const r = await fetch('/api/settings');
    if (!r.ok) return;
    const s = await r.json();
    if (!s.logo_url) return;
    document.querySelectorAll('.sidebar-logo .logo-mark, .logo-mark').forEach(mark => {
      mark.innerHTML = `<img src="${s.logo_url}" alt="לוגו" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;padding:3px" />`;
      mark.style.background = '#fff';
    });
  } catch {}
}

document.addEventListener('DOMContentLoaded', () => {
  markActive();
  renderUser();
  loadAdminLogo();
});
