// Unit tests — PDF page planning (pure paper/zoom math, no DOM).
import { describe, it, expect } from 'vitest';
import {
  planOnePagePdf,
  planContentPagePdf,
  PDF_MARGIN_IN,
  PDF_MAX_SIDE_IN,
  safePixelRatio,
  A4_LANDSCAPE_W,
  A4_LANDSCAPE_H,
  A3_LANDSCAPE_W,
  A3_LANDSCAPE_H,
} from '@/lib/chartExport';

describe('planOnePagePdf', () => {
  it('keeps a small chart on A4 (fits without enlarging)', () => {
    const plan = planOnePagePdf(A4_LANDSCAPE_W / 2, A4_LANDSCAPE_H / 2);
    expect(plan.pageSize).toBe('A4');
    expect(plan.scale).toBeLessThanOrEqual(1);
    expect(plan.scale).toBeGreaterThan(0.9); // ~1, minus the safety trim
  });

  it('always produces a single page: scaled size fits the chosen sheet', () => {
    const w = 1680; // 8-gen width
    const h = 10000; // very tall bracket
    const plan = planOnePagePdf(w, h);
    const pageW = plan.pageSize === 'A3' ? A3_LANDSCAPE_W : A4_LANDSCAPE_W;
    const pageH = plan.pageSize === 'A3' ? A3_LANDSCAPE_H : A4_LANDSCAPE_H;
    expect(w * plan.scale).toBeLessThanOrEqual(pageW);
    expect(h * plan.scale).toBeLessThanOrEqual(pageH);
  });

  it('bumps to A3 when A4 would require an unreadably small scale', () => {
    // Tall chart that fits A4 only well below the readable threshold.
    const plan = planOnePagePdf(1680, 10000);
    expect(plan.pageSize).toBe('A3');
  });

  it('never enlarges and handles a zero/empty measurement', () => {
    const plan = planOnePagePdf(0, 0);
    expect(plan.scale).toBeLessThanOrEqual(1);
  });
});

// The bracket chart's PDF page is cut to the chart, so the sheet has no wasted
// width (the PNG export always had this; the PDF was shrink-to-A3). These are the
// invariants that keep it one tight, readable page.
// @author Yuliya Malinina <julia.malinina@gmail.com> — 2026-08-05
describe('planContentPagePdf', () => {
  it('sizes the page to the chart plus the printer margins, at full scale', () => {
    // 960 x 2400 CSS px = 10 x 25 inches at 96 dpi.
    const plan = planContentPagePdf(960, 2400);
    expect(plan.scale).toBe(1);
    expect(plan.pageSize.width).toBeCloseTo(10 + 2 * PDF_MARGIN_IN, 3);
    expect(plan.pageSize.height).toBeCloseTo(25 + 2 * PDF_MARGIN_IN, 3);
  });

  // REGRESSION (2026-08-05): the page was emitted in microns, which electron's
  // printToPDF (>= 21) reads as INCHES — a ~317500 x 690000in sheet that Acrobat
  // refuses ("dimensions of this page are out-of-range"). A realistic chart must
  // land in ordinary paper territory, so a unit slip fails here loudly.
  it('emits INCHES, not microns — a real chart is a paper-sized sheet', () => {
    const plan = planContentPagePdf(1180, 2600); // the reported 10-gen chart
    expect(plan.pageSize.width).toBeGreaterThan(5);
    expect(plan.pageSize.width).toBeLessThan(20);
    expect(plan.pageSize.height).toBeGreaterThan(20);
    expect(plan.pageSize.height).toBeLessThan(40);
  });

  it('never shrinks a normal chart — readability is the point', () => {
    expect(planContentPagePdf(1680, 6000).scale).toBe(1);
  });

  it('keeps the chart aspect ratio (no distortion)', () => {
    const plan = planContentPagePdf(1200, 3600);
    const contentW = plan.pageSize.width - 2 * PDF_MARGIN_IN;
    const contentH = plan.pageSize.height - 2 * PDF_MARGIN_IN;
    expect(contentH / contentW).toBeCloseTo(3, 3);
  });

  it('scales down only when the content exceeds the 200-inch PDF side limit', () => {
    // A 12-generation bracket: 4096 leaf rows x 40px = 163840px ≈ 1706 inches tall.
    const plan = planContentPagePdf(2000, 163840);
    expect(plan.scale).toBeLessThan(1);
    expect(plan.pageSize.height).toBeLessThanOrEqual(PDF_MAX_SIDE_IN);
    expect(plan.pageSize.width).toBeLessThanOrEqual(PDF_MAX_SIDE_IN);
  });

  it('stays within PDF limits for any plausible chart size', () => {
    for (const [w, h] of [[0, 0], [1, 1], [800, 600], [5000, 50000], [99999, 99999]]) {
      const plan = planContentPagePdf(w, h);
      expect(plan.pageSize.width).toBeGreaterThan(0);
      expect(plan.pageSize.height).toBeGreaterThan(0);
      expect(plan.pageSize.width).toBeLessThanOrEqual(PDF_MAX_SIDE_IN);
      expect(plan.pageSize.height).toBeLessThanOrEqual(PDF_MAX_SIDE_IN);
      expect(plan.scale).toBeGreaterThan(0);
      expect(plan.scale).toBeLessThanOrEqual(1);
    }
  });

  it('survives a zero measurement instead of emitting a zero-size page', () => {
    const plan = planContentPagePdf(0, 0);
    expect(plan.pageSize.width).toBeGreaterThan(0);
    expect(plan.pageSize.height).toBeGreaterThan(0);
  });
});

describe('safePixelRatio', () => {
  it('uses the desired ratio for a normal-sized chart', () => {
    expect(safePixelRatio(1680, 4000, 2)).toBe(2); // 3360 x 8000, well within limits
  });

  it('clamps below the desired ratio when a side would exceed the canvas cap', () => {
    // 2000 x 18000 at 2x -> 36000px tall, over the 32000 side cap.
    const r = safePixelRatio(2000, 18000, 2);
    expect(r).toBeLessThan(2);
    expect(2000 * r).toBeLessThanOrEqual(32000);
    expect(18000 * r).toBeLessThanOrEqual(32000);
  });

  it('clamps on total area for a huge but not-too-tall chart', () => {
    const w = 20000;
    const h = 20000; // 400M px at 1x already over the 256M area cap
    const r = safePixelRatio(w, h, 2);
    expect(w * r * (h * r)).toBeLessThanOrEqual(256_000_000 + 1);
  });

  it('returns the desired ratio for a zero/empty node', () => {
    expect(safePixelRatio(0, 0, 2)).toBe(2);
  });
});
