// chartExport.ts — renderer-side export orchestration for the bracket chart.
// Keeps all the "how do we get the chart onto a page / into an image" logic out
// of the UI component: paper-size choice, fit-to-width scaling, and the DOM
// rasterization. The actual file writing happens in the main process (see
// electron/main/export.ts); these helpers only prepare the page/image and call
// the typed window.api bridge. [DRAFT — verify on target Mac.]

import type { PrintPdfOptions, SaveResult } from './ipc';

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

// --- Content-sized pages (2026-08-05) --------------------------------------
// The A4/A3 plan below fits the whole chart onto a STANDARD sheet, which for a
// deep bracket means shrinking it until the text is unreadable and leaving a
// wide empty margin. The PNG export never had that problem because the image is
// exactly the size of the content. planContentPagePdf gives the PDF the same
// property: a single page cut to the chart's own box.
// @author Yuliya Malinina <julia.malinina@gmail.com>

/** Per-side printable margin the main process applies (inches) — keep in sync
 *  with the printToPDF margins in electron/main/export.ts. */
export const PDF_MARGIN_IN = 0.315;
/** Hard PDF/Chromium ceiling: 200 inches per side. Beyond this the sheet is
 *  invalid, so an enormous chart is scaled down to fit instead. */
export const PDF_MAX_SIDE_IN = 200;
/**
 * A custom, content-sized sheet: page dimensions in INCHES + the zoom applied to
 * the chart before printing.
 *
 * UNITS — do not "fix" these to microns. Electron's modern `printToPDF` (>= 21,
 * this app is on 33) documents a custom `pageSize` object as "height and width in
 * INCHES"; microns was the old, removed API. Passing microns produced a page of
 * ~317500 x 690000 in, which Acrobat rejects with "The dimensions of this page are
 * out-of-range. Page content might be truncated." (reported 2026-08-05).
 */
export interface ContentPagePlan {
  pageSize: { width: number; height: number };
  /** Fit zoom in (0, 1]; shrink only, never enlarge. */
  scale: number;
}

/**
 * Plan a single page whose size IS the chart's size (plus the printer margins),
 * so the PDF has no wasted width — the paper equivalent of the PNG export.
 *
 * `scale` stays 1 for any normal chart; it only drops when the content would
 * exceed the 200-inch PDF side limit (a very deep bracket), in which case the
 * chart is shrunk just enough to fit and the page follows it down. Pure (no DOM)
 * so it is unit-tested.
 */
export function planContentPagePdf(
  chartWidthPx: number,
  chartHeightPx: number,
): ContentPagePlan {
  const wIn = Math.max(chartWidthPx, 1) / 96;
  const hIn = Math.max(chartHeightPx, 1) / 96;
  const maxContentIn = PDF_MAX_SIDE_IN - 2 * PDF_MARGIN_IN;
  const scale = Math.min(1, maxContentIn / wIn, maxContentIn / hIn);
  const pageWIn = wIn * scale + 2 * PDF_MARGIN_IN;
  const pageHIn = hIn * scale + 2 * PDF_MARGIN_IN;
  // Inches, rounded to 1/1000in — enough precision for an exact fit, and it keeps
  // the value well clear of floating-point noise at the 200in ceiling.
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    pageSize: { width: round(pageWIn), height: round(pageHIn) },
    scale,
  };
}

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
 * charts printed portrait and clipped.
 *
 * For charts the sheet is CUT TO THE CHART (planContentPagePdf): one page, no
 * wasted width, no shrink-to-A4 — the same tight result the PNG export gives
 * (owner request, 2026-08-05). `--print-scale` stays 1 unless the chart exceeds
 * the 200-inch PDF side limit. Non-chart views pass landscape:false and still
 * print a standard A4 portrait sheet at scale 1.
 */
export async function exportChartPdf(opts: {
  landscape: boolean;
  defaultName: string;
}): Promise<SaveResult> {
  const { landscape, defaultName } = opts;
  let pageSize: PrintPdfOptions['pageSize'] = 'A4';

  if (landscape) {
    // Measure the chart the way it will actually PRINT. On screen `.pttable` is a
    // 100%-wide scroll container, so its scrollWidth is the WINDOW width whenever
    // the chart is narrower — measuring that produced a page as wide as the app
    // window. `.pttable--measuring` mirrors the print rules (shrink-wrapped,
    // unclipped, no padding) for two frames, so what we measure is the printed
    // content box.
    const el = document.querySelector('.pttable') as HTMLElement | null;
    if (el) {
      el.classList.add('pttable--measuring');
      await nextFrame();
    }
    const plan = planContentPagePdf(el?.scrollWidth ?? 0, el?.scrollHeight ?? 0);
    el?.classList.remove('pttable--measuring');
    pageSize = plan.pageSize;
    document.documentElement.style.setProperty('--print-scale', String(plan.scale));
    await nextFrame();
  }

  try {
    // A custom page already encodes its own orientation. `landscape: true` makes
    // Chromium SWAP width and height, which would rotate the sheet away from the
    // box we just measured — so it is only sent for the standard A4/A3 sheets.
    const printLandscape = typeof pageSize === 'object' ? false : landscape;
    return await window.api.printPdf({ landscape: printLandscape, pageSize, defaultName });
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
