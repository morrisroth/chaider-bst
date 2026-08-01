const { createCanvas } = require('@napi-rs/canvas');

// PDF pages are rendered to plain PNGs on the server (this file) rather than
// with client-side pdf.js. Some mobile browsers (older Samsung Internet in
// particular) fail — sometimes hanging indefinitely — to load pdf.js's
// module worker, leaving signers looking at a blank page with no visible
// document and no way to tell why. A rendered image works identically in
// every browser ever made, no JavaScript PDF library required client-side.
const TARGET_WIDTH_PX = 1600;

class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

async function renderPageToPng(pdfBytes, pageNum) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // pdf.js insists on a plain Uint8Array — a Node Buffer (even though it IS
  // one, subclassed) is rejected outright.
  const data = new Uint8Array(pdfBytes);
  const pdf = await pdfjsLib.getDocument({ data, canvasFactory: new NodeCanvasFactory() }).promise;
  if (!Number.isInteger(pageNum) || pageNum < 1 || pageNum > pdf.numPages) {
    throw new Error('page out of range');
  }
  const page = await pdf.getPage(pageNum);
  const baseWidth = page.getViewport({ scale: 1 }).width;
  const viewport = page.getViewport({ scale: TARGET_WIDTH_PX / baseWidth });

  const canvasFactory = new NodeCanvasFactory();
  const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
  await page.render({ canvasContext: canvasAndContext.context, viewport, canvasFactory }).promise;
  return canvasAndContext.canvas.toBuffer('image/png');
}

module.exports = { renderPageToPng };
