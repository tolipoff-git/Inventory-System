import { describe, it, expect } from 'vitest';
import worker from '../src/worker/index';

const headers = {
  'Content-Type': 'application/json',
  'X-Device-ID': 'dev_test',
};

describe('worker security surface', () => {
  it('rejects disallowed Origin with 403', async () => {
    const req = new Request('https://inv.workers.dev/api/health', {
      headers: { Origin: 'https://evil.example.com' },
    });
    const res = await worker.fetch(req, { ASSETS: { fetch: () => new Response('x') } });
    expect(res.status).toBe(403);
  });

  it('rejects disallowed Origin even with valid Bearer', async () => {
    const req = new Request('https://inv.workers.dev/api/sync/inv_room_X', {
      method: 'POST',
      headers: { ...headers, Origin: 'https://evil.example.com', Authorization: 'Bearer topsecret' },
      body: JSON.stringify({ tools: [] }),
    });
    const res = await worker.fetch(req, { ASSETS: { fetch: () => new Response('x') }, SYNC_SECRET: 'topsecret' });
    expect(res.status).toBe(403);
  });

  it('allows allowlisted Origin with matching Bearer', async () => {
    const req = new Request('https://inv.workers.dev/api/sync/inv_room_X', {
      method: 'POST',
      headers: { ...headers, Origin: 'https://inventory.pages.dev', Authorization: 'Bearer topsecret' },
      body: JSON.stringify({ tools: [] }),
    });
    const res = await worker.fetch(req, {
      ASSETS: { fetch: () => new Response('x') },
      ALLOWED_ORIGIN: 'https://inventory.pages.dev',
      SYNC_SECRET: 'topsecret',
    });
    expect(res.status).toBe(200);
  });

  it('rejects wrong Bearer with 401 (constant-time path)', async () => {
    const req = new Request('https://inv.workers.dev/api/sync/inv_room_X', {
      method: 'POST',
      headers: { ...headers, Origin: 'https://inventory.pages.dev', Authorization: 'Bearer wrong' },
      body: JSON.stringify({ tools: [] }),
    });
    const res = await worker.fetch(req, {
      ASSETS: { fetch: () => new Response('x') },
      ALLOWED_ORIGIN: 'https://inventory.pages.dev',
      SYNC_SECRET: 'topsecret',
    });
    expect(res.status).toBe(401);
  });

  it('rejects non-image data URL in photo route (mime guard)', async () => {
    const req = new Request('https://inv.workers.dev/api/photo/ROOM/ph1?raw=1', {
      headers: { Origin: 'https://inventory.pages.dev' },
    });
    const kv = {
      get: async () => JSON.stringify({ url: 'data:text/html;base64,PGh0bW9v' }),
      put: async () => {},
    };
    const res = await worker.fetch(req, {
      ASSETS: { fetch: () => new Response('x') },
      ALLOWED_ORIGIN: 'https://inventory.pages.dev',
      INVENTORY_KV: kv,
    });
    // data:text/html fails the stricter scheme check with 400 (XSS guard) —
    // an image/* but unsupported MIME reaches the 415 instead.
    expect([400, 415]).toContain(res.status);
  });

  it('rejects unsupported image/* MIME (415) after scheme check', async () => {
    const req = new Request('https://inv.workers.dev/api/photo/ROOM/ph1?raw=1', {
      headers: { Origin: 'https://inventory.pages.dev' },
    });
    const kv = {
      get: async () => JSON.stringify({ url: 'data:image/svg+xml;base64,PHN0bW9v' }),
      put: async () => {},
    };
    const res = await worker.fetch(req, {
      ASSETS: { fetch: () => new Response('x') },
      ALLOWED_ORIGIN: 'https://inventory.pages.dev',
      INVENTORY_KV: kv,
    });
    expect(res.status).toBe(415);
  });

  it('rejects oversized base64 photo (413)', async () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(7 * 1024 * 1024);
    const req = new Request('https://inv.workers.dev/api/photo/ROOM/ph2?raw=1', {
      headers: { Origin: 'https://inventory.pages.dev' },
    });
    const kv = {
      get: async () => JSON.stringify({ url: huge }),
      put: async () => {},
    };
    const res = await worker.fetch(req, {
      ASSETS: { fetch: () => new Response('x') },
      ALLOWED_ORIGIN: 'https://inventory.pages.dev',
      INVENTORY_KV: kv,
    });
    expect(res.status).toBe(413);
  });

  it('serves a valid small image (200, image/png)', async () => {
    const b64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
    const req = new Request('https://inv.workers.dev/api/photo/ROOM/ph3?raw=1', {
      headers: { Origin: 'https://inventory.pages.dev' },
    });
    const kv = {
      get: async () => JSON.stringify({ url: `data:image/png;base64,${b64}` }),
      put: async () => {},
    };
    const res = await worker.fetch(req, {
      ASSETS: { fetch: () => new Response('x') },
      ALLOWED_ORIGIN: 'https://inventory.pages.dev',
      INVENTORY_KV: kv,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });
});
