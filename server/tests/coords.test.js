import { describe, it, expect } from 'vitest';
const path = require('path');
const { domBoxToPdfBox, pdfBoxToDomBox } = require(path.join(__dirname, '../../admin/pdf-coords.js'));

// A4 in PDF points
const A4 = { pageWidthPt: 595, pageHeightPt: 842 };

describe('pdf-coords', () => {
  it('converts a DOM box at 1:1 scale (canvas matches page point size exactly)', () => {
    const { pdfX, pdfY, pdfW, pdfH } = domBoxToPdfBox({
      domX: 50, domY: 50, domW: 100, domH: 40,
      canvasWidthPx: A4.pageWidthPt, canvasHeightPx: A4.pageHeightPt,
      ...A4
    });
    expect(pdfX).toBeCloseTo(50);
    expect(pdfW).toBeCloseTo(100);
    expect(pdfH).toBeCloseTo(40);
    // DOM y=50 near the top; PDF y counts up from the bottom, so it should be near the top of the page too
    expect(pdfY).toBeCloseTo(842 - 50 - 40);
  });

  it('flips the Y axis correctly (DOM top-left origin -> PDF bottom-left origin)', () => {
    // A box flush with the bottom of the DOM canvas should land at pdfY ~ 0
    const { pdfY } = domBoxToPdfBox({
      domX: 0, domY: 800, domW: 50, domH: 42,
      canvasWidthPx: A4.pageWidthPt, canvasHeightPx: A4.pageHeightPt,
      ...A4
    });
    expect(pdfY).toBeCloseTo(0, 0);
  });

  it('scales correctly when the canvas is rendered larger than the page point size', () => {
    const canvasWidthPx = A4.pageWidthPt * 2; // rendered at 2x
    const canvasHeightPx = A4.pageHeightPt * 2;
    const { pdfX, pdfW } = domBoxToPdfBox({
      domX: 100, domY: 0, domW: 200, domH: 80,
      canvasWidthPx, canvasHeightPx, ...A4
    });
    expect(pdfX).toBeCloseTo(50); // 100px / 2x scale
    expect(pdfW).toBeCloseTo(100);
  });

  it('round-trips domBoxToPdfBox -> pdfBoxToDomBox back to the original box', () => {
    const original = { domX: 30, domY: 120, domW: 150, domH: 55 };
    const canvasWidthPx = 700, canvasHeightPx = 990;
    const pdfBox = domBoxToPdfBox({ ...original, canvasWidthPx, canvasHeightPx, ...A4 });
    const domBox = pdfBoxToDomBox({ ...pdfBox, canvasWidthPx, canvasHeightPx, ...A4 });
    expect(domBox.domX).toBeCloseTo(original.domX, 5);
    expect(domBox.domY).toBeCloseTo(original.domY, 5);
    expect(domBox.domW).toBeCloseTo(original.domW, 5);
    expect(domBox.domH).toBeCloseTo(original.domH, 5);
  });
});
