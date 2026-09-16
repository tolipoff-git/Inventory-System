import { defineConfig } from 'vite';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

let commitHash = 'v98-refactor';
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch {}

const buildTime = new Date().toISOString();

// Single source of truth for the app version: `package.json` (per AGENTS.md).
// It is substituted into the bundle as `__APP_VERSION__`, which
// `src/config/constants.ts` reads as `CONFIG.APP_VERSION`, and `build.sh` uses
// for the service-worker cache stamp. Previously three places disagreed
// (package.json 99.0.0 / constants.ts v103 / a hardcoded 'v98' here).
let appVersion = 'v0';
try {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'));
  if (pkg && pkg.version) appVersion = 'v' + String(pkg.version).split('.')[0];
} catch {}

const stampSwCache = {
  name: 'stamp-sw-cache',
  apply: 'build' as const,
  closeBundle() {
    try {
      const swPath = resolve(__dirname, 'dist/sw.js');
      const stamp = `inv-inventory-${appVersion}-${commitHash}-${buildTime.replace(/[^0-9]/g, '')}`;
      writeFileSync(swPath, readFileSync(swPath, 'utf8').replace(/inv-inventory-__CACHE_STAMP__/g, stamp));
    } catch {}
  },
};

export default defineConfig({
  plugins: [stampSwCache],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          exceljs: ['exceljs'],
          qrcode: ['qrcode'],
          jsqr: ['jsqr'],
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true,
  },
});
