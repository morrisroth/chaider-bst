/* Dynamic content loader for public pages */
(function() {
  const API = '/api';

  async function get(path) {
    try { const r = await fetch(API + path); return r.ok ? r.json() : null; } catch { return null; }
  }

  function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', year:'numeric' });
  }

  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ── Load settings into hero / about ──
  async function loadSettings() {
    const s = await get('/settings');
    if (!s) return;
    const h1 = document.querySelector('.hero h1');
    if (h1 && s.hero_title) h1.innerHTML = s.hero_title;
    const lead = document.querySelector('.hero-lead');
    if (lead && s.hero_subtitle) lead.textContent = s.hero_subtitle;
    const prosePs = document.querySelectorAll('.prose p');
    if (prosePs.length && s.about_text) prosePs[0].textContent = s.about_text;
    // Hero image (blob)
    if (s.hero_image) {
      const blob = document.querySelector('.blob-img');
      if (blob) {
        blob.style.backgroundImage = `url(${s.hero_image})`;
        blob.style.backgroundSize = 'cover';
        blob.style.backgroundPosition = 'center';
        const cap = blob.querySelector('.ph-cap');
        if (cap) cap.style.display = 'none';
      }
    }
    // About image
    if (s.about_image) {
      const blobSoft = document.querySelector('.blob-soft');
      if (blobSoft) {
        blobSoft.style.backgroundImage = `url(${s.about_image})`;
        blobSoft.style.backgroundSize = 'cover';
        blobSoft.style.backgroundPosition = 'center';
        const cap = blobSoft.querySelector('.blob-cap');
        if (cap) cap.style.display = 'none';
      }
    }
    // Contact info
    if (s.phone) document.querySelectorAll('a[href^="tel:"]').forEach(a => { a.href = `tel:${s.phone}`; a.textContent = s.phone; });
    if (s.address) document.querySelectorAll('[data-address]').forEach(el => el.textContent = s.address);
  }

  // ── Load news posts into home page grid ──
  async function loadPosts() {
    const grid = document.getElementById('newsGrid');
    if (!grid) return;
    const posts = await get('/posts?featured=1');
    if (!posts || !posts.length) return;
    grid.innerHTML = posts.slice(0,3).map(p => `
      <article class="post">
        <div class="post-img${p.image ? '' : ''}" style="${p.image ? `background-image:url(${p.image});background-size:cover;background-position:center` : ''}">
          ${!p.image ? `<span class="glabel">// ${esc(p.category)}</span>` : ''}
        </div>
        <div class="post-body">
          <div class="post-meta"><span class="post-tag">${esc(p.category)}</span><span>${fmtDate(p.date)}</span></div>
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.excerpt)}</p>
          <a class="post-link" href="news.html">קרא עוד ←</a>
        </div>
      </article>`).join('');
  }

  // ── Load news page full list ──
  async function loadNewsPage() {
    const grid = document.getElementById('allNewsGrid');
    if (!grid) return;
    const posts = await get('/posts');
    if (!posts) return;
    if (!posts.length) { grid.innerHTML = '<p style="text-align:center;color:var(--muted);padding:40px">אין פרסומים עדיין</p>'; return; }
    grid.innerHTML = posts.map(p => `
      <article class="post">
        <div class="post-img" style="${p.image ? `background-image:url(${p.image});background-size:cover;background-position:center` : ''}">
          ${!p.image ? '<span class="glabel">// תמונה</span>' : ''}
        </div>
        <div class="post-body">
          <div class="post-meta"><span class="post-tag">${esc(p.category)}</span><span>${fmtDate(p.date)}</span></div>
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.excerpt)}</p>
        </div>
      </article>`).join('');
  }

  // ── Load gallery page ──
  async function loadGallery() {
    const grid = document.getElementById('galleryDynamic');
    if (!grid) return;
    const items = await get('/gallery');
    if (!items || !items.length) return;
    grid.innerHTML = items.map((item, i) => `
      <div class="gtile${i===0?' tall':''}${i===1?' wide':''}">
        <img src="${esc(item.image)}" alt="${esc(item.caption)}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0" loading="lazy" />
        ${item.caption ? `<span class="glabel">${esc(item.caption)}</span>` : ''}
      </div>`).join('');
    // Make gtile position relative for absolute img
    grid.querySelectorAll('.gtile').forEach(g => g.style.position = 'relative');
  }

  // ── Wire contact form ──
  function wireContactForm() {
    const form = document.getElementById('contactForm');
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(form));
      try {
        const r = await fetch('/api/contact', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
        if (r.ok) {
          form.style.display = 'none';
          const s = document.getElementById('csuccess');
          if (s) s.style.display = 'block';
        }
      } catch {}
    });
  }

  // ── Wire register form ──
  function wireRegisterForm() {
    const form = document.getElementById('rform');
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        const r = await fetch('/api/register', { method:'POST', body: fd });
        if (r.ok) {
          form.style.display = 'none';
          const s = document.getElementById('rsuccess');
          if (s) s.style.display = 'block';
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } catch {}
    });
  }

  // Run on every page
  document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadPosts();
    loadNewsPage();
    loadGallery();
    wireContactForm();
    wireRegisterForm();
  });
})();
