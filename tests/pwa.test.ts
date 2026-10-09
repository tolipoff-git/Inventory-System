import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function worker() {
  const handlers: Record<string, (event: any) => void> = {};
  const values = new Map<string, Response>();
  const installed: string[] = [];
  const cache = {
    addAll: async (urls: string[]) => { installed.push(...urls); for (const url of urls) values.set(url, new Response(url)); },
    match: async (request: Request | string) => values.get(typeof request === 'string' ? request : request.url),
    put: async (request: Request, response: Response) => { values.set(request.url, response); },
  };
  const context = vm.createContext({ URL, Response, Set,
    self: { location: new URL('https://inventory.example/sw.js'), clients: { claim: async () => {} }, addEventListener: (name: string, cb: any) => { handlers[name] = cb; } },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: async () => { throw new Error('offline'); },
  });
  const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
    .replace('/* __BUNDLE_ASSETS__ */', '"./assets/app.js", "./assets/styles.css"');
  vm.runInContext(source, context);
  return { handlers, installed, values };
}

describe('PWA offline printing prerequisites', () => {
  it('installs generated JS/CSS with the shell and falls back for deep-linked offline navigation', async () => {
    const { handlers, installed } = worker();
    let ready: Promise<void> = Promise.resolve();
    handlers.install({ waitUntil: (promise: Promise<void>) => { ready = promise; } });
    await ready;
    expect(installed).toContain('./assets/app.js');
    expect(installed).toContain('./assets/styles.css');
    let response: Promise<Response> | undefined;
    handlers.fetch({ request: { url: 'https://inventory.example/?tool=TW-001', mode: 'navigate', method: 'GET' }, respondWith: (promise: Promise<Response>) => { response = promise; } });
    expect(await (await response!).text()).toBe('./index.html');
  });

  it('does not intercept API requests, POSTs or external requests', () => {
    const { handlers } = worker();
    for (const request of [
      { url: 'https://inventory.example/api/sync/room', method: 'GET' },
      { url: 'https://inventory.example/index.html', method: 'POST' },
      { url: 'https://ntfy.sh/room', method: 'GET' },
    ]) {
      let intercepted = false;
      handlers.fetch({ request, respondWith: () => { intercepted = true; } });
      expect(intercepted).toBe(false);
    }
  });
});
