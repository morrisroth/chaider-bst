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

// Small preview of an uploaded photo/video (see server/lib/thumbs.js)
function thumbOf(url) {
  return /^\/uploads\/[\w-]+\.\w+$/.test(url || '') ? '/thumbs/' + url.slice(9) + '.jpg' : url;
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

// ── Styled confirm dialog (replaces the browser's confirm()) ──
// Usage: if (!(await confirmDialog({ title: 'למחוק?', message: '...', okText: 'מחיקה' }))) return;
function confirmDialog({ title = 'אישור פעולה', message = '', okText = 'אישור', cancelText = 'ביטול', danger = true } = {}) {
  if (!document.getElementById('bst-confirm-style')) {
    const st = document.createElement('style');
    st.id = 'bst-confirm-style';
    st.textContent = `
.bst-cfm{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;
  background:rgba(14,28,32,.55);backdrop-filter:blur(3px);animation:bstFade .15s ease-out}
.bst-cfm-card{background:#fff;border-radius:22px;padding:28px 28px 22px;max-width:420px;width:100%;text-align:center;
  box-shadow:0 24px 70px rgba(0,0,0,.28);animation:bstPop .18s cubic-bezier(.34,1.56,.64,1)}
.bst-cfm-ic{width:56px;height:56px;border-radius:50%;margin:0 auto 14px;display:flex;align-items:center;justify-content:center}
.bst-cfm-ic svg{width:26px;height:26px}
.bst-cfm-ic.danger{background:rgba(239,68,68,.12);color:#dc2626}
.bst-cfm-ic.info{background:rgba(27,98,115,.12);color:var(--teal)}
.bst-cfm-card h3{font-family:var(--serif);font-size:20px;font-weight:700;color:var(--ink);margin-bottom:6px}
.bst-cfm-card p{color:var(--soft);font-size:14.5px;line-height:1.6;margin-bottom:22px}
.bst-cfm-btns{display:flex;gap:10px;justify-content:center}
.bst-cfm-btns .btn{min-width:110px;justify-content:center}
.bst-cfm-ok.danger{background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;border-color:transparent}
@keyframes bstFade{from{opacity:0}}
@keyframes bstPop{from{opacity:0;transform:scale(.92)}}`;
    document.head.appendChild(st);
  }
  return new Promise(resolve => {
    const prevFocus = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'bst-cfm';
    wrap.setAttribute('role', 'alertdialog');
    wrap.setAttribute('aria-modal', 'true');
    const icon = danger
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>';
    wrap.innerHTML = `<div class="bst-cfm-card">
      <div class="bst-cfm-ic ${danger ? 'danger' : 'info'}">${icon}</div>
      <h3>${escHtml(title)}</h3>
      ${message ? `<p>${escHtml(message)}</p>` : '<div style="height:14px"></div>'}
      <div class="bst-cfm-btns">
        <button type="button" class="btn btn-grad btn-sm bst-cfm-ok ${danger ? 'danger' : ''}">${escHtml(okText)}</button>
        <button type="button" class="btn btn-line btn-sm bst-cfm-cancel">${escHtml(cancelText)}</button>
      </div></div>`;
    function close(result) {
      document.removeEventListener('keydown', onKey, true);
      wrap.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
    }
    wrap.addEventListener('click', e => { if (e.target === wrap) close(false); });
    wrap.querySelector('.bst-cfm-ok').addEventListener('click', () => close(true));
    wrap.querySelector('.bst-cfm-cancel').addEventListener('click', () => close(false));
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(wrap);
    wrap.querySelector('.bst-cfm-cancel').focus();
  });
}
