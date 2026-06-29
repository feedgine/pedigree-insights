// config.ts (main process) — persists the last-used .db path so subsequent
// launches reopen it automatically (PRD §6.1/§7.4). Stored as plain JSON in the
// Electron userData dir. No native dependency; just fs.

import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface AppConfig {
  /** Absolute path to the user's pedigree .db, or null if not yet chosen. */
  dbPath: string | null;
  /** Default generations to show on load (PRD §7.2). */
  generations: number;
  /** Saved foundation-dog names for the Foundation report. */
  foundationNames: string[];
}

const DEFAULTS: AppConfig = { dbPath: null, generations: 3, foundationNames: [] };

function configPath(): string {
  return join(app.getPath('userData'), 'config.json');
}

export function loadConfig(): AppConfig {
  try {
    const raw = readFileSync(configPath(), 'utf-8');
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppConfig>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(patch: Partial<AppConfig>): AppConfig {
  const next = { ...loadConfig(), ...patch };
  const p = configPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

/**
 * Resolve the .db path to open on launch. Returns the saved path only if the
 * file still exists; if it was moved/deleted, returns null so the app falls
 * back to the picker instead of crashing (PRD §6.1).
 */
export function resolveSavedDbPath(): string | null {
  const { dbPath } = loadConfig();
  return dbPath && existsSync(dbPath) ? dbPath : null;
}
