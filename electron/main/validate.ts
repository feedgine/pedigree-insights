// validate.ts (main process) — runtime guards for the IPC boundary.
// TypeScript types vanish at runtime, so a stale or buggy renderer could still
// send a wrong-typed, out-of-range, or oversized payload. These small asserts
// reject bad input at the trust boundary before it reaches the database or the
// filesystem. This is defensive programming (robustness), not a security claim:
// the renderer never supplies file paths (those come from main-process dialogs)
// and the DB is opened read-only with parameterized queries.

import type { PrintPdfOptions, SavePngOptions } from '../../src/lib/ipc';

/** Upper bounds — generous, just enough to reject runaway payloads. */
const MAX_NAME_LEN = 512;
const MAX_QUERY_LEN = 512;
const MAX_DATAURL_BYTES = 512 * 1024 * 1024; // 512 MB ceiling for a PNG data URL
const MAX_TEXT_LEN = 16 * 1024 * 1024; // 16 MB ceiling for an exported .txt report

export function reqString(v: unknown, field: string, maxLen = MAX_NAME_LEN): string {
  if (typeof v !== 'string') throw new Error(`Invalid ${field}: expected a string`);
  if (v.length > maxLen) throw new Error(`Invalid ${field}: too long (${v.length} > ${maxLen})`);
  return v;
}

export function reqNonEmptyString(v: unknown, field: string, maxLen = MAX_NAME_LEN): string {
  const s = reqString(v, field, maxLen);
  if (s.trim() === '') throw new Error(`Invalid ${field}: must not be empty`);
  return s;
}

export function reqNumber(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`Invalid ${field}: expected a finite number`);
  }
  return v;
}

/** Optional number: undefined/null pass through; anything present must be finite. */
export function optNumber(v: unknown, field: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  return reqNumber(v, field);
}

export function reqSearchQuery(v: unknown): string {
  return reqString(v, 'query', MAX_QUERY_LEN);
}

/** Body of an exported text report — a plain string, up to MAX_TEXT_LEN. May be
 *  empty (an empty report still writes a valid, if empty, file). */
export function reqText(v: unknown, field = 'content'): string {
  return reqString(v, field, MAX_TEXT_LEN);
}

// Custom page dimensions are in INCHES (electron printToPDF >= 21; see the units
// note on ContentPagePlan in src/lib/chartExport.ts). These bounds are the guard
// that turns a unit mix-up into a clear error instead of a PDF Acrobat refuses to
// open ("dimensions of this page are out-of-range").
/** 200in — the PDF/Acrobat page-side ceiling. */
const MAX_PAGE_IN = 200;
/** 1in — rejects a zero/garbage measurement. */
const MIN_PAGE_IN = 1;

/** A standard sheet name, or a custom {width,height} in INCHES within PDF limits
 *  (the chart export cuts the page to the chart — see chartExport.ts). */
function assertPageSize(v: unknown): void {
  if (v === 'A4' || v === 'A3') return;
  if (!v || typeof v !== 'object') throw new Error('Invalid print options: pageSize');
  const { width, height } = v as Record<string, unknown>;
  for (const [name, n] of [['width', width], ['height', height]] as const) {
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      throw new Error(`Invalid print options: pageSize.${name}`);
    }
    if (n < MIN_PAGE_IN || n > MAX_PAGE_IN) {
      throw new Error(
        `Invalid print options: pageSize.${name} must be ${MIN_PAGE_IN}-${MAX_PAGE_IN} inches`
      );
    }
  }
}

export function assertPrintPdfOptions(v: unknown): asserts v is PrintPdfOptions {
  if (!v || typeof v !== 'object') throw new Error('Invalid print options');
  const o = v as Record<string, unknown>;
  if (typeof o.landscape !== 'boolean') throw new Error('Invalid print options: landscape');
  assertPageSize(o.pageSize);
  reqString(o.defaultName, 'defaultName');
}

export function assertSavePngOptions(v: unknown): asserts v is SavePngOptions {
  if (!v || typeof v !== 'object') throw new Error('Invalid PNG options');
  const o = v as Record<string, unknown>;
  reqString(o.defaultName, 'defaultName');
  if (typeof o.dataUrl !== 'string' || !o.dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('Invalid PNG options: dataUrl must be a base64 PNG data URL');
  }
  if (o.dataUrl.length > MAX_DATAURL_BYTES) {
    throw new Error('Invalid PNG options: image too large');
  }
}
