import * as pdfjsLib from '/vendor/pdfjs/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';

const token = location.pathname.split('/')[2];
let docData = null;
const pads = new Map(); // field.key -> SignaturePad instance

function show(id) {
  ['sign-loading', 'sign-error', 'sign-done', 'sign-form'].forEach(s => {
    document.getElementById(s).style.display = s === id ? 'block' : 'none';
  });
}

function showFormError(msg) {
  const el = document.getElementById('formErr');
  el.textContent = msg;
  el.style.display = 'block';
}
function hideFormError() {
  document.getElementById('formErr').style.display = 'none';
}

// A non-interactive highlight on the document page showing where a
// signature (captured below, in its own card) will be embedded server-side.
function markSignatureSpot(pageWrap, domBox, label) {
  const marker = document.createElement('div');
  marker.className = 'sig-mark';
  marker.style.left = domBox.domX + 'px';
  marker.style.top = domBox.domY + 'px';
  marker.style.width = domBox.domW + 'px';
  marker.style.height = domBox.domH + 'px';
  marker.innerHTML = `<span>${label}</span>`;
  pageWrap.appendChild(marker);
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

async function renderAllPages() {
  const buf = await fetch(docData.pdfUrl).then(r => r.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const container = document.getElementById('pdfPages');
  container.innerHTML = '';
  const dpr = window.devicePixelRatio || 1;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    const containerWidth = container.clientWidth || document.documentElement.clientWidth - 32;
    const cssScale = containerWidth / baseViewport.width;
    const cssWidth = baseViewport.width * cssScale;
    const cssHeight = baseViewport.height * cssScale;

    const pageWrap = document.createElement('div');
    pageWrap.className = 'pdf-page-wrap';
    pageWrap.style.width = cssWidth + 'px';

    const canvas = document.createElement('canvas');
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    const ctx = canvas.getContext('2d');
    const renderViewport = page.getViewport({ scale: cssScale * dpr });
    await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
    pageWrap.appendChild(canvas);

    container.appendChild(pageWrap);

    for (const field of docData.signatureFields.filter(f => f.page === i)) {
      const domBox = PdfCoords.pdfBoxToDomBox({
        pdfX: field.x, pdfY: field.y,
        pdfW: field.width, pdfH: field.height,
        canvasWidthPx: cssWidth, canvasHeightPx: cssHeight,
        pageWidthPt: baseViewport.width, pageHeightPt: baseViewport.height
      });
      markSignatureSpot(pageWrap, domBox, field.label);
    }
  }
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

  document.getElementById('docTitle').textContent = docData.title;
  show('sign-form');

  setupSignaturePads(docData.signatureFields);
  await renderAllPages();

  document.getElementById('signForm').addEventListener('submit', onSubmit);
}

async function onSubmit(e) {
  e.preventDefault();
  hideFormError();
  const name = document.getElementById('signerName').value.trim();
  const health = document.getElementById('healthCheck').checked;
  const consent = document.getElementById('consentCheck').checked;

  if (!name) return showFormError('נא להזין שם מלא');
  for (const field of docData.signatureFields) {
    const pad = pads.get(field.key);
    if (!pad || pad.isEmpty()) return showFormError(`נא לחתום בשדה "${field.label}" לפני השליחה`);
  }
  if (!health) return showFormError('יש לאשר כי מולאה הצהרת הבריאות השנתית לפני השליחה');
  if (!consent) return showFormError('יש לאשר את הצהרת ההסכמה כדי להמשיך');

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'שולח...';

  try {
    const signatures = {};
    for (const field of docData.signatureFields) {
      signatures[field.key] = pads.get(field.key).toDataURL('image/png');
    }

    const res = await fetch(`/api/sign/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signerName: name,
        signatures,
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
