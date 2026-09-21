import { describe, it, expect } from 'vitest';
import worker, { Env } from '../src/worker/index';

const headers = {
  'Content-Type': 'application/json',
  'X-Device-ID': 'dev_test',
};

/** Static-asset fetcher stub — must be async to satisfy `WorkerFetcher`. */
const assets = { fetch: async () => new Response('x') };

// The sync API is open (the room key is the access control) — same model as the
// daily-walkthrough PWA. A `SYNC_SECRET`, if still configured, is not consulted.
const photoEnv: Env = {
  ASSETS: assets,
  ALLOWED_ORIGIN: 'https://inventory.pages.dev',
  SYNC_SECRET: 'topsecret',
};

function photoReq(path: string, extra?: Record<string, string>) {
  return new Request(`https://inv.workers.dev${path}`, {
    headers: { Origin: 'https://inventory.pages.dev', ...extra },
  });
}

describe('worker security surface', () => {
  it('rejects disallowed Origin with 403', async () => {
    const req = new Request('https://inv.workers.dev/api/health', {
      headers: { Origin: 'https://evil.example.com' },
    });
    const res = await worker.fetch(req, { ASSETS: assets });
    expect(res.status).toBe(403);
  });

  it('rejects disallowed Origin even with valid Bearer', async () => {
    const req = new Request('https://inv.workers.dev/api/sync/inv_room_X', {
      method: 'POST',
      headers: { ...headers, Origin: 'https://evil.example.com', Authorization: 'Bearer topsecret' },
      body: JSON.stringify({ tools: [] }),
    });
    const res = await worker.fetch(req, { ASSETS: assets, SYNC_SECRET: 'topsecret' });
    expect(res.status).toBe(403);
  });

  it('allows allowlisted Origin with matching Bearer', async () => {
    const req = new Request('https://inv.workers.dev/api/sync/inv_room_X', {
      method: 'POST',
      headers: { ...headers, Origin: 'https://inventory.pages.dev', Authorization: 'Bearer topsecret' },
      body: JSON.stringify({ tools: [] }),
    });
    const res = await worker.fetch(req, {
      ASSETS: assets,
      ALLOWED_ORIGIN: 'https://inventory.pages.dev',
      SYNC_SECRET: 'topsecret',
    });
    expect(res.status).toBe(200);
  });

  it('syncs with no Bearer token at all (the room key is the access control)', async () => {
    // The old fail-closed gate returned 401 here because the client's default
    // token is empty — which is why nothing ever synced.
    const req = new Request('https://inv.workers.dev/api/sync/inv_room_X', {
      method: 'POST',
      headers: { ...headers, Origin: 'https://inventory.pages.dev' },
      body: JSON.stringify({ tools: [] }),
    });
    const res = await worker.fetch(req, {
      ASSETS: assets,
      ALLOWED_ORIGIN: 'https://inventory.pages.dev',
      SYNC_SECRET: 'topsecret',
    });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('syncs with no SYNC_SECRET configured (zero-setup access model)', async () => {
    const req = new Request('https://inv.workers.dev/api/sync/inv_room_X', {
      method: 'POST',
      headers: { ...headers, Origin: 'https://inventory.pages.dev' },
      body: JSON.stringify({ tools: [] }),
    });
    const res = await worker.fetch(req, {
      ASSETS: assets,
      ALLOWED_ORIGIN: 'https://inventory.pages.dev',
    });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('reports a retryable failure when the KV write is rejected', async () => {
    const req = new Request('https://inv.workers.dev/api/sync/inv_room_X', {
      method: 'POST',
      headers: { ...headers, Origin: 'https://inventory.pages.dev' },
      body: JSON.stringify({ tools: [] }),
    });
    const kv = {
      get: async () => null,
      put: async () => {
        throw new Error('value too large');
      },
    };
    const res = await worker.fetch(req, {
      ASSETS: assets,
      ALLOWED_ORIGIN: 'https://inventory.pages.dev',
      INVENTORY_KV: kv,
    });
    // Never claim success on a failed authoritative write — the client keeps the
    // payload pending and retries instead of marking it synced.
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.retryable).toBe(true);
  });

  it('serves a photo route without a token (404 when absent, not 401)', async () => {
    const res = await worker.fetch(photoReq('/api/photo/ROOM/ph1?raw=1'), photoEnv);
    expect(res.status).toBe(404);
  });

  it('serves valid photo when authorized via Bearer header', async () => {
    const b64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
    const req = photoReq('/api/photo/ROOM/ph3?raw=1', { Authorization: 'Bearer topsecret' });
    const kv = {
      get: async () => JSON.stringify({ url: `data:image/png;base64,${b64}` }),
      put: async () => {},
    };
    const res = await worker.fetch(req, { ...photoEnv, INVENTORY_KV: kv });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  it('rejects non-image data URL in photo route (mime guard)', async () => {
    const req = photoReq('/api/photo/ROOM/ph1?raw=1', { Authorization: 'Bearer topsecret' });
    const kv = {
      get: async () => JSON.stringify({ url: 'data:text/html;base64,PGh0bW9v' }),
      put: async () => {},
    };
    const res = await worker.fetch(req, { ...photoEnv, INVENTORY_KV: kv });
    // data:text/html fails the stricter scheme check with 400 (XSS guard) —
    // an image/* but unsupported MIME reaches the 415 instead.
    expect([400, 415]).toContain(res.status);
  });

  it('rejects unsupported image/* MIME (data: scheme check rejects SVG)', async () => {
    const req = photoReq('/api/photo/ROOM/ph1?raw=1', { Authorization: 'Bearer topsecret' });
    const kv = {
      get: async () => JSON.stringify({ url: 'data:image/svg+xml;base64,PHN0bW9v' }),
      put: async () => {},
    };
    const res = await worker.fetch(req, { ...photoEnv, INVENTORY_KV: kv });
    // The tightened isSafePhotoUrl rejects any non-raster data: MIME at the
    // scheme-validation stage with 400 (SVG-as-XML/script SSRF+XSS guard).
    expect(res.status).toBe(400);
  });

  it('rejects oversized base64 photo (413)', async () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(7 * 1024 * 1024);
    const req = photoReq('/api/photo/ROOM/ph2?raw=1', { Authorization: 'Bearer topsecret' });
    const kv = {
      get: async () => JSON.stringify({ url: huge }),
      put: async () => {},
    };
    const res = await worker.fetch(req, { ...photoEnv, INVENTORY_KV: kv });
    expect(res.status).toBe(413);
  });

  it('accepts ?token= query param for browser image access (ignored, still served)', async () => {
    const b64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
    const req = photoReq('/photo/ROOM/ph4?raw=1&token=topsecret');
    const kv = {
      get: async () => JSON.stringify({ url: `data:image/png;base64,${b64}` }),
      put: async () => {},
    };
    const res = await worker.fetch(req, { ...photoEnv, INVENTORY_KV: kv });
    expect(res.status).toBe(200);
  });

  it('rejects SSRF-prone internal/private http photo URL', async () => {
    for (const bad of [
      'http://127.0.0.1/x.png',
      'http://10.0.0.5/x.png',
      'http://192.168.1.1/x.png',
      'http://172.16.0.1/x.png',
      'http://169.254.169.254/x.png',
      'http://localhost/x.png',
      'http://0x7f000001/x.png',
    ]) {
      const req = photoReq('/api/photo/ROOM/ph5?raw=1', { Authorization: 'Bearer topsecret' });
      const kv = {
        get: async () => JSON.stringify({ url: bad }),
        put: async () => {},
      };
      const res = await worker.fetch(req, { ...photoEnv, INVENTORY_KV: kv });
      expect(res.status).toBe(400);
    }
  });

  it('allows public http photo URL', async () => {
    const req = photoReq('/api/photo/ROOM/ph6?raw=1', { Authorization: 'Bearer topsecret' });
    const kv = {
      get: async () => JSON.stringify({ url: 'https://cdn.example.com/photos/a.png' }),
      put: async () => {},
    };
    const res = await worker.fetch(req, { ...photoEnv, INVENTORY_KV: kv });
    expect(res.status).toBe(302);
  });
});
