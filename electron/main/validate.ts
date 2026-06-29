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

export function assertPrintPdfOptions(v: unknown): asserts v is PrintPdfOptions {
  if (!v || typeof v !== 'object') throw new Error('Invalid print options');
  const o = v as Record<string, unknown>;
  if (typeof o.landscape !== 'boolean') throw new Error('Invalid print options: landscape');
  if (o.pageSize !== 'A4' && o.pageSize !== 'A3') throw new Error('Invalid print options: pageSize');
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
