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

  // Inject an image into a blob shape div (keeps overflow:hidden clip)
  function injectBlobImg(blob, url) {
    if (!blob || !url) return;
    // Remove placeholder caption
    blob.querySelector('.ph-cap')?.remove();
    blob.querySelector('.blob-cap')?.remove();
    // Remove any previously injected img
    blob.querySelector('img.blob-injected')?.remove();
    // Insert absolutely-positioned img — clipped by the blob's overflow:hidden
    const img = document.createElement('img');
    img.src = url;
    img.className = 'blob-injected';
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1;border-radius:inherit;';
    blob.style.position = 'relative';
    blob.style.background = 'transparent';
    blob.prepend(img);
  }

  // ── Settings → update hero, about, contact info ──
  async function loadSettings() {
    const s = await get('/settings');
    if (!s) return;

    // Logo
    if (s.logo_url) {
      document.querySelectorAll('.logo-mark').forEach(mark => {
        mark.innerHTML = `<img src="${s.logo_url}" alt="לוגו" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;padding:4px" />`;
        mark.style.background = '#fff';
        mark.style.boxShadow = '0 4px 14px rgba(14,58,70,.15)';
      });
    }

    // Hero title
    const h1 = document.querySelector('.hero h1');
    if (h1 && s.hero_title) h1.innerHTML = s.hero_title;

    // Hero subtitle
    const lead = document.querySelector('.hero-lead');
    if (lead && s.hero_subtitle) lead.textContent = s.hero_subtitle;

    // Hero image (right blob in hero section)
    if (s.hero_image) injectBlobImg(document.querySelector('.blob-img'), s.hero_image);

    // About text
    if (s.about_text) {
      const prosePs = document.querySelectorAll('.prose p');
      if (prosePs.length) prosePs[0].textContent = s.about_text;
    }

    // About image — about section on homepage AND about.html page
    if (s.about_image) injectBlobImg(document.querySelector('.blob-soft'), s.about_image);

    // Approach image — approach.html page (blob-soft.cool)
    if (s.approach_image) injectBlobImg(document.querySelector('.blob-soft.cool'), s.approach_image);

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

  // ── News page: full list + category filter + article modal ──
  async function loadAllPosts() {
    const grid = document.getElementById('allNewsGrid');
    const filterBar = document.getElementById('newsFilter');
    if (!grid) return;

    const posts = await get('/posts');
    if (!posts) return;
    if (!posts.length) {
      grid.innerHTML = '<p style="text-align:center;color:var(--muted);padding:40px;grid-column:1/-1">אין פרסומים עדיין</p>';
      return;
    }

    // Unique categories
    const cats = ['הכל', ...new Set(posts.map(p => p.category).filter(Boolean))];
    let active = 'הכל';

    function renderGrid(list) {
      if (!list.length) {
        grid.innerHTML = '<p style="text-align:center;color:var(--muted);padding:40px;grid-column:1/-1">אין פרסומים בקטגוריה זו</p>';
        return;
      }
      grid.innerHTML = list.map(p => `
        <article class="post" style="cursor:pointer" data-post-id="${esc(p.id)}">
          <div class="post-img" style="${p.image ? `background-image:url(${p.image});background-size:cover;background-position:center;min-height:180px` : ''}">
            ${!p.image ? `<span class="glabel">// ${esc(p.category)}</span>` : ''}
          </div>
          <div class="post-body">
            <div class="post-meta"><span class="post-tag">${esc(p.category)}</span><span>${fmtDate(p.date)}</span></div>
            <h3>${esc(p.title)}</h3>
            <p>${esc(p.excerpt)}</p>
            <span class="post-link">קרא עוד ←</span>
          </div>
        </article>`).join('');
    }

    function renderFilter() {
      if (!filterBar) return;
      filterBar.innerHTML = cats.map(c =>
        `<button class="nf-pill${c === active ? ' nf-active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`
      ).join('');
    }

    // Filter pill clicks
    if (filterBar) {
      filterBar.addEventListener('click', e => {
        const btn = e.target.closest('.nf-pill');
        if (!btn) return;
        active = btn.dataset.cat;
        filterBar.querySelectorAll('.nf-pill').forEach(b =>
          b.classList.toggle('nf-active', b.dataset.cat === active)
        );
        renderGrid(active === 'הכל' ? posts : posts.filter(p => p.category === active));
      });
    }

    // Card click → open modal
    grid.addEventListener('click', e => {
      const card = e.target.closest('[data-post-id]');
      if (card) openPost(card.dataset.postId);
    });

    renderFilter();
    renderGrid(posts);
  }

  // ── Article modal ──
  window.openPost = async function(id) {
    const modal = document.getElementById('postModal');
    const content = document.getElementById('postModalContent');
    if (!modal || !content) return;
    content.innerHTML = '<div style="padding:64px;text-align:center;color:var(--muted)">טוען…</div>';
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    const post = await get('/posts/' + id);
    if (!post) {
      content.innerHTML = '<div style="padding:64px;text-align:center;color:var(--muted)">שגיאה בטעינה</div>';
      return;
    }
    content.innerHTML =
      (post.image ? `<img class="pm-img" src="${esc(post.image)}" alt="${esc(post.title)}" />` : '') +
      `<div class="pm-body">
        <div class="pm-meta">
          <span class="post-tag">${esc(post.category)}</span>
          <span style="font-size:13px;color:var(--muted)">${fmtDate(post.date)}</span>
        </div>
        <div class="pm-title">${esc(post.title)}</div>
        <div class="pm-content">${esc(post.content || post.excerpt)}</div>
      </div>`;
  };

  window.closePost = function() {
    const modal = document.getElementById('postModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
  };

  // ── Gallery page: dynamic grid + lightbox ──
  async function loadGallery() {
    const grid = document.getElementById('galleryDynamic');
    if (!grid) return;
    const items = await get('/gallery');
    if (!items || !items.length) return;

    // Build grid tiles
    grid.innerHTML = items.map((item, i) => {
      const cls = ['gtile', item.layout === 'wide' ? 'wide' : '', item.layout === 'tall' ? 'tall' : '']
        .filter(Boolean).join(' ');
      const isVideo = item.type === 'video';
      const thumb = isVideo
        ? `<video src="${esc(item.video)}#t=0.1" preload="metadata" muted playsinline
             style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>
           <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">
             <svg width="56" height="56" viewBox="0 0 60 60" fill="none">
               <circle cx="30" cy="30" r="30" fill="rgba(255,255,255,.22)"/>
               <polygon points="23,18 47,30 23,42" fill="#fff"/>
             </svg>
           </div>`
        : `<img src="${esc(item.image)}" alt="${esc(item.caption)}"
              style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" />`;
      return `<div class="${cls}" style="position:relative;cursor:pointer" onclick="glbOpen(${i})">
        ${thumb}
        ${item.caption ? `<span class="glabel">${esc(item.caption)}</span>` : ''}
      </div>`;
    }).join('');

    // ── Lightbox setup ──
    const lb     = document.getElementById('glb');
    const media  = document.getElementById('glbMedia');
    const cap    = document.getElementById('glbCaption');
    const ctr    = document.getElementById('glbCounter');
    if (!lb) return;

    let cur = 0;

    function lbRender() {
      const item = items[cur];
      // Stop any playing video
      const oldV = media.querySelector('video'); if (oldV) { oldV.pause(); oldV.src = ''; }

      if (item.type === 'video') {
        media.innerHTML = `<video src="${esc(item.video)}" controls autoplay playsinline
          style="max-width:100%;max-height:80vh;border-radius:14px;outline:none;display:block"></video>`;
      } else {
        media.innerHTML = `<img src="${esc(item.image)}" alt="${esc(item.caption)}"
          style="max-width:100%;max-height:80vh;object-fit:contain;border-radius:14px;display:block" />`;
      }
      cap.textContent = item.caption || '';
      ctr.textContent = items.length > 1 ? `${cur + 1} / ${items.length}` : '';
      const showNav = items.length > 1;
      document.getElementById('glbPrev').style.display = showNav ? 'flex' : 'none';
      document.getElementById('glbNext').style.display = showNav ? 'flex' : 'none';
    }

    window.glbOpen = function(idx) {
      cur = idx; lbRender();
      lb.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    };

    function lbClose() {
      lb.style.display = 'none';
      document.body.style.overflow = '';
      const v = media.querySelector('video'); if (v) { v.pause(); v.src = ''; }
    }

    function lbNav(dir) {
      const v = media.querySelector('video'); if (v) { v.pause(); v.src = ''; }
      cur = (cur + dir + items.length) % items.length;
      lbRender();
    }

    document.getElementById('glbClose').onclick = lbClose;
    document.getElementById('glbPrev').onclick  = () => lbNav(-1);
    document.getElementById('glbNext').onclick  = () => lbNav(1);
    lb.addEventListener('click', e => { if (e.target === lb) lbClose(); });

    // Keyboard
    document.addEventListener('keydown', e => {
      if (lb.style.display !== 'flex') return;
      if (e.key === 'Escape')      lbClose();
      if (e.key === 'ArrowRight')  lbNav(-1);
      if (e.key === 'ArrowLeft')   lbNav(1);
    });

    // Touch swipe
    let tx = 0;
    lb.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend',   e => {
      const dx = e.changedTouches[0].clientX - tx;
      if (Math.abs(dx) > 50) lbNav(dx > 0 ? -1 : 1);
    });
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

  // ── Mobile hamburger (JS toggle — reliable across all browsers) ──
  function initMobileNav() {
    const toggle = document.getElementById('navtoggle');
    const nav    = document.querySelector('.site-nav');
    const burger = document.querySelector('.nav-burger');
    if (!toggle || !nav) return;

    function setOpen(open) {
      nav.style.display = open ? 'block' : '';
      toggle.checked = open;
    }

    toggle.addEventListener('change', () => setOpen(toggle.checked));

    // Close when any nav link is tapped
    nav.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => setOpen(false))
    );

    // Close on outside tap
    document.addEventListener('click', e => {
      if (!nav.contains(e.target) && !burger?.contains(e.target) && e.target !== toggle)
        setOpen(false);
    }, { passive: true });
  }

  // ── Floating הרשמה button — mobile only, above WhatsApp ──
  function injectMobileRegBtn() {
    if (window.innerWidth > 768) return;
    if (location.pathname.includes('register')) return;
    const existing = document.querySelector('.mobile-reg');
    if (existing) return; // already injected
    const a = document.createElement('a');
    a.href      = 'register.html';
    a.className = 'mobile-reg';
    a.innerHTML = '← הרשמה';
    a.style.display = 'flex';
    document.body.appendChild(a);
  }

  // ── Run ──
  document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadFeaturedPosts();
    loadAllPosts();
    loadGallery();
    initMobileNav();
    injectMobileRegBtn();

    // Modal close: button + backdrop + Escape
    const pmClose = document.getElementById('pmClose');
    const postModal = document.getElementById('postModal');
    if (pmClose) pmClose.addEventListener('click', closePost);
    if (postModal) postModal.addEventListener('click', e => { if (e.target === postModal) closePost(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && postModal?.style.display === 'flex') closePost(); });
  });
})();
