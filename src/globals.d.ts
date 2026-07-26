// Ambient globals injected at build time by Vite's `define` (electron.vite.config.ts).

/** App version from package.json, shown in the header. */
declare const __APP_VERSION__: string;

/** Git build tag (`git describe --tags --always --dirty`): equals `v{version}` on
 *  a clean release, else a dev/dirty descriptor. Shown as a marker while developing. */
declare const __APP_BUILD__: string;
