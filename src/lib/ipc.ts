// ipc.ts — the shared contract between the Electron main process and the
// renderer. Channel names live here once; preload and main both import them so
// they can never drift. The renderer only ever talks to main through this API
// (contextIsolation is on; there is no direct DB access in the renderer).

import type { Animal } from './schema';
import type { PedigreeTreeNode } from './pedigreeAlgorithm';
import type { LinebreedingReport } from './linebreeding';
import type { FoundationReport } from './contribution';
import type { HypotheticalMatingReport } from './hypotheticalMating';

export const IPC = {
  pickDatabase: 'db:pick',
  getStatus: 'db:status',
  searchAnimals: 'db:search',
  getAnimal: 'db:getAnimal',
  getPhoto: 'db:getPhoto',
  getPedigree: 'db:getPedigree',
  getPedigreeTree: 'db:getPedigreeTree',
  getLinebreeding: 'db:getLinebreeding',
  getFoundation: 'db:getFoundation',
  getHypotheticalMating: 'db:getHypotheticalMating',
  importFoundation: 'foundation:import',
  clearFoundation: 'foundation:clear',
  getConfig: 'config:get',
  setGenerations: 'config:setGenerations',
  printPdf: 'print:pdf',
  savePng: 'png:save',
  saveText: 'file:saveText',
} as const;

/** Options for rendering the current view to a PDF (main process). */
export interface PrintPdfOptions {
  /** A4 landscape when true (bracket charts); portrait otherwise (text reports). */
  landscape: boolean;
  /**
   * Paper size. Text reports use the standard sheets; the bracket chart passes a
   * CUSTOM size in INCHES (electron printToPDF's unit since v21) cut to the chart's
   * own box, so the PDF has no wasted width — see chartExport.planContentPagePdf.
   * @author Yuliya Malinina <julia.malinina@gmail.com> — 2026-08-05
   */
  pageSize: 'A4' | 'A3' | { width: number; height: number };
  /** Suggested file name (without extension) for the save dialog. */
  defaultName: string;
}

/** Options for saving the rendered chart as a single PNG image. */
export interface SavePngOptions {
  /** A `data:image/png;base64,...` URL produced from the chart DOM node. */
  dataUrl: string;
  /** Suggested file name (without extension) for the save dialog. */
  defaultName: string;
}

/** Result of a save (PDF or PNG) request. */
export interface SaveResult {
  /** True if the user cancelled the save dialog. */
  canceled: boolean;
  /** Absolute path written, when not cancelled. */
  filePath?: string;
}

/** Result of importing a foundation-dog list from a file. */
export interface FoundationImportResult {
  /** True if the user cancelled the file picker (list unchanged). */
  canceled: boolean;
  /** Parsed, de-duplicated foundation names now saved. */
  names: string[];
  /** How many of `names` were found in the database. */
  matched: number;
  /** Names not found in the database (likely typos / different spelling). */
  unmatched: string[];
}

/** Connection status the renderer uses to decide first-run vs. main view. */
export interface DbStatus {
  connected: boolean;
  /** Absolute path of the open db, or null. */
  path: string | null;
  /** Basename for display in the header. */
  fileName: string | null;
  /** Error message if the saved path failed to open. */
  error: string | null;
}

/** The API surface exposed on `window.api` by the preload script. */
export interface PedigreeApi {
  /** Open the native file picker; returns the new status after opening. */
  pickDatabase(): Promise<DbStatus>;
  /** Current connection status (resolves the saved path on first call). */
  getStatus(): Promise<DbStatus>;
  /** Name/registration search for the lookup overlay. */
  searchAnimals(query: string): Promise<Animal[]>;
  getAnimal(name: string): Promise<Animal | null>;
  /** Load a subject's photo as a `data:` URL. The stored `Photo` value is a file
   *  path from the editing machine; main uses only its filename and reads
   *  `<db-folder>/Photos/<filename>` (read-only). Returns null when there is no
   *  photo or the file cannot be read. */
  getPhoto(photo: string): Promise<string | null>;
  /** Build the ancestor tree for a Name at the given depth. */
  getPedigree(name: string, generations: number): Promise<PedigreeTreeNode>;
  /** Build the ancestor tree for the indented TEXT pedigree (de-dup traversal,
   *  up to 20 generations). Null if no DB is open. */
  getPedigreeTree(
    name: string,
    generations: number,
  ): Promise<PedigreeTreeNode | null>;
  /** Structural linebreeding report (repeated ancestors and their crosses) for
   *  a Name at the given depth, listing ancestors with >= minCrosses crosses. */
  getLinebreeding(
    name: string,
    generations: number,
    minCrosses?: number,
  ): Promise<LinebreedingReport | null>;
  /** Foundation-contribution report for a Name, using the saved foundation list
   *  (computed across all generations). Null if no DB is open. */
  getFoundation(name: string): Promise<FoundationReport | null>;
  /** Project a planned dam × sire litter: pedigree, litter COI/AVK, common
   *  ancestors, line-breeding classification and warn-only checks. Read-only —
   *  nothing is written to the database. Null if no DB is open. */
  getHypotheticalMating(
    sireName: string,
    damName: string,
    generations: number,
  ): Promise<HypotheticalMatingReport | null>;
  /** Open a file picker, parse a foundation-dog list, save it, and report how
   *  many names matched the database. */
  importFoundation(): Promise<FoundationImportResult>;
  /** Clear the saved foundation list. */
  clearFoundation(): Promise<void>;
  getConfig(): Promise<{
    dbPath: string | null;
    generations: number;
    foundationNames: string[];
  }>;
  setGenerations(generations: number): Promise<void>;
  /** Render the current view to a PDF (forced A4/A3, landscape for charts) and
   *  save it via a native dialog. Bypasses window.print() so orientation is
   *  reliable on macOS, where @page orientation is ignored. */
  printPdf(options: PrintPdfOptions): Promise<SaveResult>;
  /** Save the full chart as a single PNG (no page limit) via a native dialog. */
  savePng(options: SavePngOptions): Promise<SaveResult>;
  /** Write `content` as a UTF-8 .txt file via a native "Save As" dialog.
   *  `defaultName` seeds the dialog's filename (extension added by main).
   *  Used by the Indented Tree report's "TXT" export. */
  saveText(defaultName: string, content: string): Promise<SaveResult>;
}

declare global {
  interface Window {
    api: PedigreeApi;
  }
}
