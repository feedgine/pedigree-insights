// Unit tests — PDF page planning (pure paper/zoom math, no DOM).
import { describe, it, expect } from 'vitest';
import {
  planOnePagePdf,
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
