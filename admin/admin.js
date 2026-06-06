/* Shared admin utilities */
const API = '/api';

function getToken() { return localStorage.getItem('bst_token'); }
function getUser()  { return localStorage.getItem('bst_user'); }

function requireAuth() {
  if (!getToken()) { window.location.href = '/admin/login.html'; }
}

function logout() {
  localStorage.removeItem('bst_token');
  localStorage.removeItem('bst_user');
  window.location.href = '/admin/login.html';
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

document.addEventListener('DOMContentLoaded', () => {
  markActive();
  renderUser();
});
