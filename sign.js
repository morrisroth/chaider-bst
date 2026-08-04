const token = location.pathname.split('/')[2];
let docData = null;
const pads = new Map(); // field.key -> SignaturePad instance
let jumpBtnObserver = null;

function show(id) {
  ['sign-loading', 'sign-error', 'sign-done', 'sign-form'].forEach(s => {
    document.getElementById(s).style.display = s === id ? 'block' : 'none';
  });
  if (id !== 'sign-form') {
    // Disconnect first — once #signForm is hidden it stops intersecting,
    // which would otherwise re-fire the observer and undo this.
    if (jumpBtnObserver) jumpBtnObserver.disconnect();
    document.getElementById('jumpToSignBtn').style.display = 'none';
  }
}

function showFormError(msg) {
  const el = document.getElementById('formErr');
  el.textContent = msg;
  el.style.display = 'block';
}
function hideFormError() {
  document.getElementById('formErr').style.display = 'none';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('שגיאה בקריאת הקובץ המצורף'));
    reader.readAsDataURL(file);
  });
}

// Builds one signature-pad card per field (below the document, always in
// the same place in the form) rather than a canvas overlaid on the PDF.
function setupSignaturePads(fields) {
  const container = document.getElementById('sigFields');
  container.innerHTML = '';

  fields.forEach(field => {
    const wrap = document.createElement('div');
    wrap.className = 'sig-field';

    const label = document.createElement('div');
    label.className = 'sig-field-label';
    label.textContent = field.label;
    wrap.appendChild(label);

    const padWrap = document.createElement('div');
    padWrap.className = 'sig-pad-wrap';
    const canvas = document.createElement('canvas');
    canvas.className = 'sig-pad-canvas';
    padWrap.appendChild(canvas);
    const placeholder = document.createElement('div');
    placeholder.className = 'sig-pad-placeholder';
    placeholder.innerHTML = '✎<br>חתמו כאן באמצעות העכבר או האצבע';
    padWrap.appendChild(placeholder);
    wrap.appendChild(padWrap);

    const toolbar = document.createElement('div');
    toolbar.className = 'sig-toolbar';
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn btn-line btn-sm';
    clearBtn.textContent = 'נקה חתימה';
    toolbar.appendChild(clearBtn);
    wrap.appendChild(toolbar);

    container.appendChild(wrap);

    function resize() {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      const newW = Math.round(rect.width * ratio);
      const newH = Math.round(rect.height * ratio);
      if (canvas.width === newW && canvas.height === newH) return; // spurious resize (e.g. keyboard toggling) — nothing to do
      // Resizing a canvas clears its bitmap — save any drawn strokes first and replay them after
      const existingPad = pads.get(field.key);
      const savedData = existingPad ? existingPad.toData() : null;
      canvas.width = newW;
      canvas.height = newH;
      canvas.getContext('2d').scale(ratio, ratio);
      if (existingPad) {
        existingPad.clear();
        if (savedData && savedData.length) existingPad.fromData(savedData);
      }
    }
    window.addEventListener('resize', resize);
    resize();

    const pad = new SignaturePad(canvas, { backgroundColor: 'rgba(0,0,0,0)', penColor: 'rgb(21,40,45)' });
    pad.addEventListener('beginStroke', () => { placeholder.style.display = 'none'; });
    clearBtn.addEventListener('click', () => {
      pad.clear();
      placeholder.style.display = 'flex';
    });
    pads.set(field.key, pad);
  });
}

// Pages are rendered to plain PNGs server-side (server/lib/pdfRender.js) and
// just displayed as <img> tags here — no client-side PDF library needed, so
// there's no worker-loading compatibility gap for any browser to fall into.
async function renderAllPages() {
  const container = document.getElementById('pdfPages');
  container.innerHTML = '';

  const loads = [];
  for (let i = 1; i <= docData.pageCount; i++) {
    const pageWrap = document.createElement('div');
    pageWrap.className = 'pdf-page-wrap';

    const img = document.createElement('img');
    img.className = 'pdf-page-img';
    img.src = `/api/sign/${token}/page/${i}`;
    img.alt = `עמוד ${i}`;
    pageWrap.appendChild(img);
    container.appendChild(pageWrap);

    loads.push(new Promise((resolve, reject) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', () => reject(new Error(`page ${i} failed to load`)), { once: true });
    }));
  }
  await Promise.all(loads);
}

async function init() {
  show('sign-loading');
  let res, data;
  try {
    res = await fetch(`/api/sign/${token}`);
    data = await res.json();
  } catch {
    document.getElementById('errorTitle').textContent = 'שגיאת רשת';
    document.getElementById('errorMsg').textContent = 'לא ניתן להתחבר לשרת. בדקו את החיבור לאינטרנט ונסו שוב.';
    show('sign-error');
    return;
  }

  if (!res.ok) {
    document.getElementById('errorTitle').textContent = res.status === 429 ? 'יותר מדי בקשות' : 'הקישור אינו זמין';
    document.getElementById('errorMsg').textContent = data.error || 'אירעה שגיאה';
    show('sign-error');
    return;
  }

  docData = data;

  document.getElementById('pageTitle').textContent = docData.title;
  document.title = docData.title.includes('חיידר בעל שם טוב') ? docData.title : `${docData.title} — חיידר בעל שם טוב`;
  document.getElementById('docTitle').textContent = docData.title;
  show('sign-form');

  if (docData.introText) {
    document.getElementById('introTextContent').textContent = docData.introText;
    document.getElementById('introCard').style.display = 'block';
  }
  if (docData.attachmentRequired) {
    document.getElementById('attachmentLabelText').textContent = `העלאת ${docData.attachmentLabel} *`;
    document.getElementById('attachmentGroup').style.display = 'block';
    document.getElementById('introCard').style.display = 'block';
  }
  document.getElementById('attachmentInput').addEventListener('change', () => {
    const file = document.getElementById('attachmentInput').files[0];
    const drop = document.getElementById('attachmentDrop');
    const label = document.getElementById('attachmentFileName');
    if (file) {
      drop.classList.add('has-file');
      label.textContent = `✓ ${file.name}`;
    } else {
      drop.classList.remove('has-file');
      label.textContent = 'לחצו לבחירת קובץ (תמונה או PDF)';
    }
  });

  const jumpBtn = document.getElementById('jumpToSignBtn');
  jumpBtn.addEventListener('click', () => {
    document.getElementById('signForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  // Hide the jump button once the form itself is already on screen — no
  // need for a shortcut to somewhere the signer can already see.
  jumpBtnObserver = new IntersectionObserver(([entry]) => {
    jumpBtn.style.display = entry.isIntersecting ? 'none' : 'flex';
  });
  jumpBtnObserver.observe(document.getElementById('signForm'));

  setupSignaturePads(docData.signatureFields);

  // A render/network failure here is now rare — plain <img> loading has none
  // of client-side pdf.js's worker-compatibility failure modes — but still
  // fall back to a direct link rather than leaving a blank, unexplained gap.
  try {
    await renderAllPages();
  } catch (err) {
    console.error('PDF preview rendering failed, falling back to direct link:', err);
    document.getElementById('pdfPages').style.display = 'none';
    document.getElementById('pdfFallbackLink').href = docData.pdfUrl;
    document.getElementById('pdfFallback').style.display = 'block';
  }

  document.getElementById('signForm').addEventListener('submit', onSubmit);
}

async function onSubmit(e) {
  e.preventDefault();
  hideFormError();
  const name = document.getElementById('signerName').value.trim();
  const email = document.getElementById('signerEmail').value.trim();
  const health = document.getElementById('healthCheck').checked;
  const photo = document.getElementById('photoCheck').checked;
  const consent = document.getElementById('consentCheck').checked;

  if (!name) return showFormError('נא להזין שם מלא');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showFormError('נא להזין כתובת מייל תקינה');
  let attachmentFile = null;
  if (docData.attachmentRequired) {
    attachmentFile = document.getElementById('attachmentInput').files[0];
    if (!attachmentFile) return showFormError(`יש לצרף ${docData.attachmentLabel || 'אסמכתא'}`);
    if (attachmentFile.size > 8 * 1024 * 1024) return showFormError('הקובץ המצורף גדול מדי (מקסימום 8MB)');
  }
  for (const field of docData.signatureFields) {
    const pad = pads.get(field.key);
    if (!pad || pad.isEmpty()) return showFormError(`נא לחתום בשדה "${field.label}" לפני השליחה`);
  }
  if (!health) return showFormError('יש לאשר כי מולאה הצהרת הבריאות השנתית לפני השליחה');
  if (!photo) return showFormError('יש לאשר את הצהרת הצילום לפני השליחה');
  if (!consent) return showFormError('יש לאשר את הצהרת ההסכמה כדי להמשיך');

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'שולח...';

  try {
    const signatures = {};
    for (const field of docData.signatureFields) {
      signatures[field.key] = pads.get(field.key).toDataURL('image/png');
    }
    const attachment = attachmentFile ? await fileToDataUrl(attachmentFile) : null;

    const res = await fetch(`/api/sign/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signerName: name,
        signerEmail: email,
        signatures,
        attachment,
        consent: true
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'שגיאה בשליחת החתימה');

    show('sign-done');
  } catch (err) {
    showFormError(err.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'שליחת חתימה';
  }
}

init();
