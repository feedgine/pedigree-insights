// export.ts (main process) — file-writing IPC handlers for chart export.
// Kept out of index.ts so the export concern (PDF via printToPDF, PNG via a
// renderer-produced data URL) lives in one place. The renderer-side
// orchestration (paper choice, fit-to-width scale, rasterization) is in
// src/lib/chartExport.ts; here we only render/decode and write bytes to disk.

import { BrowserWindow, dialog, ipcMain } from 'electron';
import { writeFileSync } from 'node:fs';
import { assertPrintPdfOptions, assertSavePngOptions, reqString, reqText } from './validate';
import { IPC, type SaveResult } from '../../src/lib/ipc';

/** Turn a suggested name into a safe file stem. */
function safeStem(name: string): string {
  return name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'pedigree';
}

/**
 * Register the PDF + PNG save handlers. `getWin` returns the current main window
 * (it is recreated on macOS reactivate, so we resolve it lazily per call).
 */
export function registerExportIpc(getWin: () => BrowserWindow | null): void {
  // Render the current renderer view to a PDF. We drive printing from the main
  // process (printToPDF) rather than the renderer's window.print(), because on
  // macOS window.print() ignores the CSS @page orientation — a wide bracket
  // chart then prints portrait and is clipped. printToPDF forces the page size
  // deterministically.
  //
  // The renderer decides the sheet (chartExport.ts): text reports use standard
  // A4/A3, while the bracket chart sends a CUSTOM size in microns cut to the
  // chart's own measured box, so the PDF is as tight as the PNG rather than a
  // shrunk-to-A3 chart floating in white space (owner request, 2026-08-05).
  // printToPDF emulates print media so the @media print rules (chrome stripped,
  // container shrink-wrapped, caption shown) apply. Margins are ~8mm (0.315in) —
  // the renderer adds the same allowance when sizing a custom page, so keep the
  // two in sync (chartExport PDF_MARGIN_IN).
  ipcMain.handle(
    IPC.printPdf,
    async (_e, opts: unknown): Promise<SaveResult> => {
      assertPrintPdfOptions(opts);
      const win = getWin();
      if (!win) return { canceled: true };
      const data = await win.webContents.printToPDF({
        landscape: opts.landscape,
        pageSize: opts.pageSize,
        printBackground: true,
        margins: { top: 0.315, bottom: 0.315, left: 0.315, right: 0.315 },
      });
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: 'Save as PDF',
        defaultPath: `${safeStem(opts.defaultName)}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (canceled || !filePath) return { canceled: true };
      writeFileSync(filePath, data);
      return { canceled: false, filePath };
    }
  );

  // Save the full chart as a single PNG. The renderer rasterizes the whole
  // bracket node (html-to-image) into a data URL, so there is no page-size or
  // pagination limit — the entire tree lands in one image (the PedigreePub
  // "save as PNG" workaround). We just decode and write the bytes here.
  ipcMain.handle(
    IPC.savePng,
    async (_e, opts: unknown): Promise<SaveResult> => {
      assertSavePngOptions(opts);
      const win = getWin();
      if (!win) return { canceled: true };
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: 'Save chart as PNG',
        defaultPath: `${safeStem(opts.defaultName)}.png`,
        filters: [{ name: 'PNG image', extensions: ['png'] }],
      });
      if (canceled || !filePath) return { canceled: true };
      const base64 = opts.dataUrl.replace(/^data:image\/png;base64,/, '');
      writeFileSync(filePath, Buffer.from(base64, 'base64'));
      return { canceled: false, filePath };
    }
  );

  // Save an exported text report (the Indented Tree pedigree) as a UTF-8 .txt
  // file via a native Save As dialog. Read-only DB posture is unaffected — this
  // writes a user-chosen file outside the database, never the .db itself. The
  // content is produced entirely in the renderer (src/lib/indentedTree.ts), so
  // the on-screen report and the saved file are byte-identical.
  ipcMain.handle(
    IPC.saveText,
    async (_e, defaultName: unknown, content: unknown): Promise<SaveResult> => {
      const name = reqString(defaultName, 'defaultName');
      const text = reqText(content, 'content');
      const win = getWin();
      if (!win) return { canceled: true };
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: 'Export pedigree as text',
        defaultPath: `${safeStem(name)}.txt`,
        filters: [
          { name: 'Text file', extensions: ['txt'] },
          { name: 'All files', extensions: ['*'] },
        ],
      });
      if (canceled || !filePath) return { canceled: true };
      writeFileSync(filePath, text, 'utf-8');
      return { canceled: false, filePath };
    }
  );
}
