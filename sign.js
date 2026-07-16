import * as pdfjsLib from '/vendor/pdfjs/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';

const token = location.pathname.split('/')[2];
let docData = null;
let pad = null;

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

// Creates the live signature pad canvas positioned exactly over the marked
// signature box on the page, and wires up drawing + a clear button placed
// right beneath it.
function attachSignaturePad(pageWrap, domBox) {
  const sigBox = document.createElement('div');
  sigBox.className = 'sig-box-live';
  sigBox.style.left = domBox.domX + 'px';
  sigBox.style.top = domBox.domY + 'px';
  sigBox.style.width = domBox.domW + 'px';
  sigBox.style.height = domBox.domH + 'px';

  const canvas = document.createElement('canvas');
  canvas.className = 'sig-box-canvas';
  sigBox.appendChild(canvas);

  const placeholder = document.createElement('div');
  placeholder.className = 'sig-box-placeholder';
  placeholder.textContent = '✎ חתמו כאן';
  sigBox.appendChild(placeholder);

  pageWrap.appendChild(sigBox);

  function resize() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    const newW = Math.round(rect.width * ratio);
    const newH = Math.round(rect.height * ratio);
    if (canvas.width === newW && canvas.height === newH) return; // spurious resize (e.g. keyboard toggling) — nothing to do
    // Resizing a canvas clears its bitmap — save any drawn strokes first and replay them after
    const savedData = pad ? pad.toData() : null;
    canvas.width = newW;
    canvas.height = newH;
    canvas.getContext('2d').scale(ratio, ratio);
    if (pad) {
      pad.clear();
      if (savedData && savedData.length) pad.fromData(savedData);
    }
  }
  window.addEventListener('resize', resize);
  resize();

  pad = new SignaturePad(canvas, { backgroundColor: 'rgba(0,0,0,0)', penColor: 'rgb(21,40,45)' });
  pad.addEventListener('beginStroke', () => { placeholder.style.display = 'none'; });

  const toolbar = document.createElement('div');
  toolbar.className = 'sig-toolbar';
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn btn-line btn-sm';
  clearBtn.textContent = 'נקה חתימה';
  clearBtn.addEventListener('click', () => {
    pad.clear();
    placeholder.style.display = 'flex';
  });
  toolbar.appendChild(clearBtn);
  pageWrap.after(toolbar);
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

    if (i === docData.signaturePage) {
      const domBox = PdfCoords.pdfBoxToDomBox({
        pdfX: docData.signatureX, pdfY: docData.signatureY,
        pdfW: docData.signatureWidth, pdfH: docData.signatureHeight,
        canvasWidthPx: cssWidth, canvasHeightPx: cssHeight,
        pageWidthPt: baseViewport.width, pageHeightPt: baseViewport.height
      });
      attachSignaturePad(pageWrap, domBox);
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
  document.getElementById('signerName').value = docData.signerNameSuggested || '';
  show('sign-form');

  await renderAllPages();

  document.getElementById('signForm').addEventListener('submit', onSubmit);
}

async function onSubmit(e) {
  e.preventDefault();
  hideFormError();
  const name = document.getElementById('signerName').value.trim();
  const consent = document.getElementById('consentCheck').checked;

  if (!name) return showFormError('נא להזין שם מלא');
  if (!pad || pad.isEmpty()) return showFormError('נא לחתום במקום המסומן במסמך לפני השליחה');
  if (!consent) return showFormError('יש לאשר את הצהרת ההסכמה כדי להמשיך');

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'שולח...';

  try {
    const res = await fetch(`/api/sign/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signerName: name,
        signatureImage: pad.toDataURL('image/png'),
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
