import { defineConfig } from 'vite';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

let commitHash = 'v98-refactor';
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch {}

const buildTime = new Date().toISOString();
const appVersion = 'v98';

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
