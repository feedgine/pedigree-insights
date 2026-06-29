// chartExport.ts — renderer-side export orchestration for the bracket chart.
// Keeps all the "how do we get the chart onto a page / into an image" logic out
// of the UI component: paper-size choice, fit-to-width scaling, and the DOM
// rasterization. The actual file writing happens in the main process (see
// electron/main/export.ts); these helpers only prepare the page/image and call
// the typed window.api bridge. [DRAFT — verify on target Mac.]

import type { SaveResult } from './ipc';

/** CSS px at 96 dpi for a millimetre measurement. */
const px = (mm: number) => (mm / 25.4) * 96;

// Landscape printable areas (8mm margins), matching the main-process margins.
export const A4_LANDSCAPE_W = px(297 - 2 * 8);
export const A4_LANDSCAPE_H = px(210 - 2 * 8);
export const A3_LANDSCAPE_W = px(420 - 2 * 8);
export const A3_LANDSCAPE_H = px(297 - 2 * 8);

// Below this fit-scale, A4 text is too small — prefer the larger A3 sheet.
const READABLE_MIN_SCALE = 0.6;
// Trim the final scale slightly so rounding never spills onto a second page.
const ONE_PAGE_SAFETY = 0.98;

/** Chosen paper + zoom for fitting the whole chart on one page. */
export interface PdfPagePlan {
  pageSize: 'A4' | 'A3';
  /** Fit zoom in (0, 1]; shrink only, never enlarge. */
  scale: number;
}

/** Scale that fits a w×h box inside a pw×ph page (both dimensions); ≤ 1. */
function fitScale(w: number, h: number, pw: number, ph: number): number {
  if (w <= 0 || h <= 0) return 1;
  return Math.min(pw / w, ph / h, 1);
}

/**
 * Pure paper/zoom decision (no DOM) so it can be unit-tested. Fits the ENTIRE
 * chart — width *and* height — onto a single landscape page, so the PDF is a
 * one-page certificate rather than a tall bracket sliced across many pages
 * (which is what an 8-gen grid would otherwise produce). Uses A4 when that fits
 * at a readable scale, else the larger A3 for a bigger result. PNG remains the
 * full-resolution option for deep charts.
 */
export function planOnePagePdf(chartWidthPx: number, chartHeightPx: number): PdfPagePlan {
  const s4 = fitScale(chartWidthPx, chartHeightPx, A4_LANDSCAPE_W, A4_LANDSCAPE_H);
  if (s4 >= READABLE_MIN_SCALE) {
    return { pageSize: 'A4', scale: s4 * ONE_PAGE_SAFETY };
  }
  const s3 = fitScale(chartWidthPx, chartHeightPx, A3_LANDSCAPE_W, A3_LANDSCAPE_H);
  return { pageSize: 'A3', scale: s3 * ONE_PAGE_SAFETY };
}

// Browser canvas safety limits. Chromium caps a single canvas at 32767px per
// side and ~268M px total area; exceeding either yields a blank/clipped image.
// We stay comfortably under both.
const MAX_CANVAS_SIDE = 32000;
const MAX_CANVAS_AREA = 256_000_000;

/** Largest pixelRatio (capped at `desired`) that keeps a w×h node within the
 *  canvas side and area limits. Pure, so it is unit-tested. Can return < 1 for
 *  an enormous chart — a low-res image still beats a blank one. */
export function safePixelRatio(w: number, h: number, desired = 2): number {
  if (w <= 0 || h <= 0) return desired;
  const bySide = MAX_CANVAS_SIDE / Math.max(w, h);
  const byArea = Math.sqrt(MAX_CANVAS_AREA / (w * h));
  return Math.min(desired, bySide, byArea);
}

/** Wait two animation frames so a just-applied style (zoom / capture class) has
 *  laid out before we snapshot the page. */
const nextFrame = (): Promise<void> =>
  new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );

/**
 * Save the current chart as a PDF. Printing is driven from the main process
 * (printToPDF) because macOS ignores the CSS @page orientation, so wide bracket
 * charts printed portrait and clipped. We pick the smallest paper that fits the
 * chart width — A4, or A3 when the columns are too wide for A4 (mirroring the
 * PedigreePub tool) — then set `--print-scale` to shrink any remaining width.
 * Height still paginates downward; use {@link exportChartPng} for one unbroken
 * image. Non-chart views pass landscape:false and print A4 portrait at scale 1.
 */
export async function exportChartPdf(opts: {
  landscape: boolean;
  defaultName: string;
}): Promise<SaveResult> {
  const { landscape, defaultName } = opts;
  let pageSize: 'A4' | 'A3' = 'A4';

  if (landscape) {
    // Measure the full chart (scroll container holds the whole bracket) and fit
    // the entire thing — width and height — onto one page.
    const el = document.querySelector('.pttable') as HTMLElement | null;
    const plan = planOnePagePdf(el?.scrollWidth ?? 0, el?.scrollHeight ?? 0);
    pageSize = plan.pageSize;
    document.documentElement.style.setProperty('--print-scale', String(plan.scale));
    await nextFrame();
  }

  try {
    return await window.api.printPdf({ landscape, pageSize, defaultName });
  } finally {
    document.documentElement.style.setProperty('--print-scale', '1');
  }
}

/** PNG export result, with an optional notice (e.g. resolution was reduced to
 *  stay within the browser canvas limits for a very large chart). */
export type PngExportResult = SaveResult & { warning?: string };

/**
 * Save the whole chart as a single PNG — no page-size or pagination limit, so
 * the entire tree lands in one image (the PedigreePub "save as PNG" workaround).
 * The scroll container is briefly expanded (`.pttable--capturing`) so the full
 * scrolled content is rasterized, not just the on-screen viewport. The pixel
 * ratio is clamped so an enormous chart can't silently exceed the canvas limit
 * and come out blank; if clamped, a warning is returned for the UI to surface.
 */
export async function exportChartPng(opts: {
  defaultName: string;
}): Promise<PngExportResult> {
  const node = document.querySelector('.pttable') as HTMLElement | null;
  if (!node) return { canceled: true };

  node.classList.add('pttable--capturing');
  await nextFrame();
  try {
    const DESIRED = 2;
    const pixelRatio = safePixelRatio(node.scrollWidth, node.scrollHeight, DESIRED);
    const warning =
      pixelRatio < DESIRED
        ? `This chart is very large, so the PNG was saved at reduced resolution (${pixelRatio.toFixed(
            2
          )}×) to stay within image limits. For a crisp full-size copy, save as PDF instead.`
        : undefined;

    const { toPng } = await import('html-to-image');
    const dataUrl = await toPng(node, {
      backgroundColor: '#ffffff',
      pixelRatio,
      cacheBust: true,
    });
    const result = await window.api.savePng({ dataUrl, defaultName: opts.defaultName });
    return { ...result, warning: result.canceled ? undefined : warning };
  } finally {
    node.classList.remove('pttable--capturing');
  }
}
