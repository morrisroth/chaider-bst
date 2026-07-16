// Converts between DOM (top-left origin, CSS px, relative to the rendered
// canvas) and PDF (bottom-left origin, PDF points, relative to the page)
// coordinate systems. Pure math, no DOM/browser APIs used directly, so this
// runs both in the browser (admin wizard, public sign page) and under Node
// (Vitest) via the dual export below.

function domBoxToPdfBox({ domX, domY, domW, domH, canvasWidthPx, canvasHeightPx, pageWidthPt, pageHeightPt }) {
  const scaleX = canvasWidthPx / pageWidthPt;
  const scaleY = canvasHeightPx / pageHeightPt;
  const pdfW = domW / scaleX;
  const pdfH = domH / scaleY;
  const pdfX = domX / scaleX;
  const pdfY = pageHeightPt - (domY / scaleY) - pdfH;
  return { pdfX, pdfY, pdfW, pdfH };
}

function pdfBoxToDomBox({ pdfX, pdfY, pdfW, pdfH, canvasWidthPx, canvasHeightPx, pageWidthPt, pageHeightPt }) {
  const scaleX = canvasWidthPx / pageWidthPt;
  const scaleY = canvasHeightPx / pageHeightPt;
  const domW = pdfW * scaleX;
  const domH = pdfH * scaleY;
  const domX = pdfX * scaleX;
  const domY = (pageHeightPt - pdfY - pdfH) * scaleY;
  return { domX, domY, domW, domH };
}

const pdfCoordsExports = { domBoxToPdfBox, pdfBoxToDomBox };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = pdfCoordsExports;
} else {
  window.PdfCoords = pdfCoordsExports;
}
