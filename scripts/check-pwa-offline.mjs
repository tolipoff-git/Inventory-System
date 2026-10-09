import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { preview } from 'vite';

const sw = await readFile('dist/sw.js', 'utf8');
for (const name of await readdir('dist/assets')) assert(sw.includes(`./assets/${name}`), `Not precached: ${name}`);
assert(!sw.includes('__BUNDLE_ASSETS__'), 'Precache manifest was not generated');
const server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ headless: true,
  ...(process.env.LABEL_CHROMIUM_PATH ? { executablePath: process.env.LABEL_CHROMIUM_PATH } : {}), args: ['--no-sandbox'],
});
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const diagnostics = [];
  page.on('console', msg => diagnostics.push(msg.text()));
  page.on('pageerror', error => diagnostics.push(error.message));
  page.on('requestfailed', request => diagnostics.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`));
  await page.addInitScript(() => sessionStorage.setItem('inv_auth_active', 'true'));
  await page.route('https://ntfy.sh/**', route => route.abort());
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready.then(reg => reg.active.state === 'activated'));
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  diagnostics.push(JSON.stringify(await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys.find(key => key.startsWith('inv-inventory-')));
    return { keys, entries: await Promise.all((await cache.keys()).map(async request => ({ path: new URL(request.url).pathname, vary: (await cache.match(request))?.headers.get('vary') }))) };
  })));
  const initialized = page.waitForEvent('console', { predicate: msg => msg.text().includes('UI mounted successfully') });
  await context.setOffline(true);
  await page.goto(`${origin}/?tool=TW-001`, { waitUntil: 'load' });
  try { await initialized; } catch (error) { console.error(diagnostics.join('\n')); throw error; }
  assert(await page.locator('#headerQueueBadge').count(), 'Application JS did not render the header offline');
  const cachedNames = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys.find(key => key.startsWith('inv-inventory-')));
    return (await cache.keys()).map(request => new URL(request.url).pathname);
  });
  assert(cachedNames.some(name => name.endsWith('.css')));
  assert(cachedNames.some(name => name.endsWith('.js') && name.includes('/assets/')));
  console.log('PWA QA passed: generated JS/CSS precache and first-install offline deep-link bootstrap.');
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
