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

  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Settings → update hero, about, contact info ──
  async function loadSettings() {
    const s = await get('/settings');
    if (!s) return;

    // Hero title
    const h1 = document.querySelector('.hero h1');
    if (h1 && s.hero_title) h1.innerHTML = s.hero_title;

    // Hero subtitle
    const lead = document.querySelector('.hero-lead');
    if (lead && s.hero_subtitle) lead.textContent = s.hero_subtitle;

    // Hero image → set as blob background
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

    // About text
    if (s.about_text) {
      const prosePs = document.querySelectorAll('.prose p');
      if (prosePs.length) prosePs[0].textContent = s.about_text;
    }

    // About image → set as blob-soft background
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

    // Phone links
    if (s.phone) {
      document.querySelectorAll('a[href^="tel:"]').forEach(a => {
        a.href = `tel:${s.phone}`;
        if (a.textContent.match(/^0[5-9]/)) a.textContent = s.phone;
      });
      // WhatsApp link
      const phone = s.phone.replace(/\D/g, '').replace(/^0/, '972');
      document.querySelectorAll('a[href^="https://wa.me/"]').forEach(a => {
        a.href = `https://wa.me/${phone}`;
      });
    }

    // Address
    if (s.address) {
      document.querySelectorAll('a[href*="המנונא"]').forEach(a => a.textContent = s.address);
    }

    // Page title
    if (s.site_name) document.title = `${document.title.split('—')[0].trim()} — ${s.site_name}`;
  }

  // ── Home page: featured news grid ──
  async function loadFeaturedPosts() {
    const grid = document.getElementById('newsGrid');
    if (!grid) return;
    const posts = await get('/posts');
    if (!posts || !posts.length) return;

    const featured = posts.filter(p => p.featured).slice(0, 3);
    const toShow = featured.length ? featured : posts.slice(0, 3);

    grid.innerHTML = toShow.map(p => `
      <article class="post">
        <div class="post-img${p.image ? '' : ''}" style="${p.image ? `background-image:url(${p.image});background-size:cover;background-position:center;min-height:180px` : ''}">
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

  // ── News page: full list ──
  async function loadAllPosts() {
    const grid = document.getElementById('allNewsGrid');
    if (!grid) return;
    const posts = await get('/posts');
    if (!posts) return;
    if (!posts.length) {
      grid.innerHTML = '<p style="text-align:center;color:var(--muted);padding:40px;grid-column:1/-1">אין פרסומים עדיין</p>';
      return;
    }
    grid.innerHTML = posts.map(p => `
      <article class="post">
        <div class="post-img" style="${p.image ? `background-image:url(${p.image});background-size:cover;background-position:center;min-height:180px` : ''}">
          ${!p.image ? `<span class="glabel">// ${esc(p.category)}</span>` : ''}
        </div>
        <div class="post-body">
          <div class="post-meta"><span class="post-tag">${esc(p.category)}</span><span>${fmtDate(p.date)}</span></div>
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.excerpt)}</p>
        </div>
      </article>`).join('');
  }

  // ── Gallery page: dynamic grid ──
  async function loadGallery() {
    const grid = document.getElementById('galleryDynamic');
    if (!grid) return;
    const items = await get('/gallery');
    if (!items || !items.length) return;

    grid.innerHTML = items.map((item, i) => `
      <div class="gtile${i === 0 ? ' tall' : ''}${i === 3 ? ' wide' : ''}">
        <img src="${esc(item.image)}"
          alt="${esc(item.caption)}"
          style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"
          loading="lazy" />
        ${item.caption ? `<span class="glabel">${esc(item.caption)}</span>` : ''}
      </div>`).join('');
  }

  // ── Contact form → POST to API (override inline handler) ──
  window.submitContact = async function(e) {
    e.preventDefault();
    const form = document.getElementById('cform');
    if (!form) return false;
    const data = {
      name:    form.querySelector('[name=name]')?.value || '',
      phone:   form.querySelector('[name=phone]')?.value || '',
      email:   form.querySelector('[name=email]')?.value || '',
      subject: form.querySelector('[name=subject]')?.value || '',
      message: form.querySelector('[name=message]')?.value || '',
    };
    try {
      const r = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (r.ok) {
        form.style.display = 'none';
        const s = document.getElementById('csuccess');
        if (s) s.style.display = 'block';
      }
    } catch {}
    return false;
  };

  // ── Register form → POST to API (override inline handler) ──
  window.submitReg = async function(e) {
    e.preventDefault();
    const form = document.getElementById('rform');
    if (!form) return false;
    const fd = new FormData(form);
    try {
      const r = await fetch('/api/register', { method: 'POST', body: fd });
      if (r.ok) {
        form.style.display = 'none';
        const s = document.getElementById('rsuccess');
        if (s) s.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch {}
    return false;
  };

  // ── Run ──
  document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadFeaturedPosts();
    loadAllPosts();
    loadGallery();
  });
})();
