import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Single source of truth for the app version shown in the UI: package.json.
// Injected into the renderer as the compile-time constant __APP_VERSION__.
const pkgVersion = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
).version as string;

// Build identity from git: the exact tag on a clean release (e.g. "v1.5.0"), or a
// descriptive string during development ("v1.4.0-2-ga1b2c3d-dirty") so a dev/WIP
// build is never mistaken for the released version. Empty if git is unavailable.
let buildTag = '';
try {
  buildTag = execSync('git describe --tags --always --dirty', {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim();
} catch {
  buildTag = '';
}

// electron-vite drives three independent builds: main, preload, renderer.
// better-sqlite3 is a native module and must stay external (never bundled).
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: '.',
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(pkgVersion),
      __APP_BUILD__: JSON.stringify(buildTag),
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'index.html') },
      },
    },
    resolve: {
      alias: { '@': resolve(__dirname, 'src') },
    },
  },
});
