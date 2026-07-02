// index.ts (main process) — app lifecycle, window creation, and the IPC
// handlers that bridge the renderer to the read-only database layer.
//
// Security posture: contextIsolation on, nodeIntegration off, sandbox on. The
// renderer never touches better-sqlite3 directly — it calls the typed API in
// preload, which forwards to the handlers below.

import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import { basename, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { PedigreeDatabase } from './database';
import { loadConfig, resolveSavedDbPath, saveConfig } from './config';
import { registerExportIpc } from './export';
import { applyAppMenu } from './menu';
import { reqNonEmptyString, reqNumber, optNumber, reqSearchQuery } from './validate';
import { IPC, type DbStatus, type FoundationImportResult } from '../../src/lib/ipc';

/** Run `fn`, logging its wall-clock duration. Used to profile the heavy
 *  recursive reports on real databases before deciding whether any of them needs
 *  to move off the main process (see architecture review). */
function timed<T>(label: string, fn: () => T): T {
  const t = performance.now();
  try {
    return fn();
  } finally {
    console.log(`[perf] ${label} — ${(performance.now() - t).toFixed(0)}ms`);
  }
}
import {
  LINEBREEDING_MAX_GENERATIONS,
  clampGenerations,
} from '../../src/lib/pedigreeAlgorithm';
import { parseFoundationList } from '../../src/lib/contribution';

let win: BrowserWindow | null = null;
let database: PedigreeDatabase | null = null;
let lastError: string | null = null;

function status(): DbStatus {
  return {
    connected: database !== null,
    path: database?.path ?? null,
    fileName: database ? basename(database.path) : null,
    error: lastError,
  };
}

/** Open (or replace) the active read-only database connection. */
function openDatabase(dbPath: string): DbStatus {
  try {
    database?.close();
    database = new PedigreeDatabase(dbPath);
    saveConfig({ dbPath });
    lastError = null;
  } catch (err) {
    database = null;
    lastError = err instanceof Error ? err.message : String(err);
  }
  return status();
}

const isDev = !!process.env.ELECTRON_RENDERER_URL;

/** Apply a Content-Security-Policy in the packaged app only. In dev, Vite's
 *  HMR client needs inline scripts + a websocket, so no CSP is imposed. */
function applyProductionCsp(): void {
  if (isDev) return;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:;",
        ],
      },
    });
  });
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'PedigreeInsights',
    backgroundColor: '#f5f6f8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox:false so the bundled preload (which uses require/contextBridge)
      // loads as CommonJS. contextIsolation:true + nodeIntegration:false keep
      // the renderer isolated; it still reaches the DB only through window.api.
      sandbox: false,
    },
  });

  // Open external links in the user's browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Surface a blank-screen cause instead of failing silently: log it and open
  // DevTools so the error is visible.
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`Renderer failed to load (${code} ${desc}): ${url}`);
    win?.webContents.openDevTools({ mode: 'detach' });
  });
  win.webContents.on('render-process-gone', (_e, d) =>
    console.error('Renderer process gone:', d.reason)
  );

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.getStatus, () => {
    // First call resolves the saved path; reopen if a valid one exists.
    if (!database) {
      const saved = resolveSavedDbPath();
      if (saved) return openDatabase(saved);
    }
    return status();
  });

  ipcMain.handle(IPC.pickDatabase, async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: 'Choose pedigree database',
      properties: ['openFile'],
      filters: [
        { name: 'Pedigree database (SQLite)', extensions: ['db', 'sqlite', 'sqlite3'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return status();
    return openDatabase(result.filePaths[0]);
  });

  ipcMain.handle(IPC.searchAnimals, (_e, query: unknown) =>
    database ? database.searchAnimals(reqSearchQuery(query)) : []
  );

  ipcMain.handle(IPC.getAnimal, (_e, name: unknown) =>
    database ? database.getAnimal(reqNonEmptyString(name, 'name')) : null
  );

  ipcMain.handle(IPC.getPedigree, (_e, name: unknown, generations: unknown) => {
    if (!database) return null;
    const n = reqNonEmptyString(name, 'name');
    const gens = clampGenerations(reqNumber(generations, 'generations'));
    return timed(`getPedigree(${gens}g)`, () => database!.getPedigree(n, gens));
  });

  ipcMain.handle(
    IPC.getLinebreeding,
    (_e, name: unknown, generations: unknown, minCrosses?: unknown) => {
      if (!database) return null;
      const n = reqNonEmptyString(name, 'name');
      // Linebreeding allows deeper detail (up to 20 generations).
      const gens = clampGenerations(
        reqNumber(generations, 'generations'),
        LINEBREEDING_MAX_GENERATIONS
      );
      const min = optNumber(minCrosses, 'minCrosses');
      return timed(`getLinebreeding(${gens}g)`, () =>
        database!.getLinebreeding(n, gens, min)
      );
    }
  );

  ipcMain.handle(IPC.getFoundation, (_e, name: unknown) => {
    if (!database) return null;
    const n = reqNonEmptyString(name, 'name');
    const { foundationNames } = loadConfig();
    return timed(`getFoundation(${foundationNames.length} names)`, () =>
      database!.getFoundation(n, foundationNames)
    );
  });

  ipcMain.handle(IPC.importFoundation, async (): Promise<FoundationImportResult> => {
    const result = await dialog.showOpenDialog(win!, {
      title: 'Choose a foundation-dog list (one name per line, or CSV)',
      properties: ['openFile'],
      filters: [
        { name: 'Text / CSV', extensions: ['txt', 'csv', 'tsv'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, names: loadConfig().foundationNames, matched: 0, unmatched: [] };
    }
    let text = '';
    try {
      text = readFileSync(result.filePaths[0], 'utf-8');
    } catch (err) {
      throw new Error(
        `Could not read that file: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    const names = parseFoundationList(text);
    // Validate against the database (which names actually exist).
    const unmatched = database ? names.filter((n) => !database!.hasAnimal(n)) : names;
    saveConfig({ foundationNames: names });
    return { canceled: false, names, matched: names.length - unmatched.length, unmatched };
  });

  ipcMain.handle(IPC.clearFoundation, () => {
    saveConfig({ foundationNames: [] });
  });

  ipcMain.handle(IPC.getConfig, () => {
    const { dbPath, generations, foundationNames } = loadConfig();
    return { dbPath, generations, foundationNames };
  });

  ipcMain.handle(IPC.setGenerations, (_e, generations: unknown) => {
    saveConfig({ generations: clampGenerations(reqNumber(generations, 'generations')) });
  });

  // PDF + PNG chart export (see electron/main/export.ts). `win` is recreated on
  // macOS reactivate, so the handlers resolve it lazily.
  registerExportIpc(() => win);
}

app.whenReady().then(() => {
  applyProductionCsp();
  applyAppMenu();
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  database?.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => database?.close());
