import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Vitest runs in plain Node (no Electron). Unit tests hit pure logic with an
// in-memory animal map; integration tests open the real fixture .db via
// better-sqlite3. Keep this config independent of electron.vite.config.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
});
