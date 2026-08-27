import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
const root = process.cwd();
await build({
  root,
  configFile: false,
  plugins: [react()],
  define: { __APP_VERSION__: '"0.0.0"', __APP_BUILD__: '""' },
  resolve: { alias: { '@': resolve(root, 'src') } },
  build: {
    outDir: '/tmp/pi-verify-out',
    emptyOutDir: true,
    rollupOptions: { input: { index: resolve(root, 'index.html') } },
  },
  logLevel: 'info',
});
