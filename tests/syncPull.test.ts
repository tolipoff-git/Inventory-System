import { describe, it, expect, afterEach, vi } from 'vitest';
import { pullSyncPayload, pushSyncPayload } from '../src/sync/syncApi';

/**
 * The pull used to return `null` for every failure, so a 401 (wrong Bearer
 * token) or a 503 (Worker without `SYNC_SECRET`) looked exactly like an empty
 * room — and the UI reported “synced” while nothing was ever exchanged.
 */

const realFetch = globalThis.fetch;

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>): void {
  globalThis.fetch = vi.fn((input: any, init?: RequestInit) =>
    impl(String(input), init)
  ) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

const validPayload = { tools: [{ id: 'TW-001' }], deviceId: 'dev_x', updatedAt: '2026-09-18T10:00:00.000Z' };

describe('pullSyncPayload — failures are classified, not swallowed', () => {
  it('reports a wrong Bearer token as unauthorized (not an empty room)', async () => {
    mockFetch(async () => jsonResponse({ error: 'Unauthorized' }, 401));
    await expect(pullSyncPayload('INV-MAIN')).resolves.toEqual({ kind: 'unauthorized' });
  });

  it('reports a Worker without SYNC_SECRET as unconfigured', async () => {
    mockFetch(async () => jsonResponse({ error: 'SYNC_SECRET not configured' }, 503));
    await expect(pullSyncPayload('INV-MAIN')).resolves.toEqual({ kind: 'unconfigured' });
  });

  it('reports a room with no revision yet as empty', async () => {
    mockFetch(async () => jsonResponse({ notFound: true }, 404));
    await expect(pullSyncPayload('INV-MAIN')).resolves.toEqual({ kind: 'empty' });
  });

  it('returns the payload on success', async () => {
    mockFetch(async () => jsonResponse(validPayload, 200));
    const outcome = await pullSyncPayload('INV-MAIN');
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.payload.tools).toHaveLength(1);
      expect(outcome.payload.updatedAt).toBe(validPayload.updatedAt);
    }
  });

  it('treats a malformed body and a network error as errors', async () => {
    mockFetch(async () => jsonResponse({ nope: true }, 200));
    const bad = await pullSyncPayload('INV-MAIN');
    expect(bad.kind).toBe('error');

    mockFetch(async () => {
      throw new Error('offline');
    });
    const net = await pullSyncPayload('INV-MAIN');
    expect(net).toEqual({ kind: 'error', message: 'offline' });
  });

  it('sends the room key and the Bearer token', async () => {
    let seenUrl = '';
    let seenAuth = '';
    mockFetch(async (url, init) => {
      seenUrl = url;
      seenAuth = String((init?.headers as Record<string, string>)?.Authorization || '');
      return jsonResponse(validPayload, 200);
    });
    await pullSyncPayload('plant a');
    // Room is upper-cased and namespaced so both devices hit the same KV key.
    expect(seenUrl).toContain('/api/sync/inv_room_PLANT%20A');
    expect(seenAuth.startsWith('Bearer ')).toBe(true);
  });
});

describe('pushSyncPayload — returns the HTTP status', () => {
  it('reports ok with the status on success', async () => {
    mockFetch(async () => jsonResponse({ success: true }, 200));
    const outcome = await pushSyncPayload('INV-MAIN', validPayload as any);
    expect(outcome).toEqual({ ok: true, status: 200 });
  });

  it('reports the failing status on 401', async () => {
    mockFetch(async () => jsonResponse({ error: 'Unauthorized' }, 401));
    const outcome = await pushSyncPayload('INV-MAIN', validPayload as any);
    expect(outcome).toEqual({ ok: false, status: 401 });
  });

  it('reports status 0 when the network is unreachable', async () => {
    mockFetch(async () => {
      throw new Error('offline');
    });
    const outcome = await pushSyncPayload('INV-MAIN', validPayload as any);
    expect(outcome).toEqual({ ok: false, status: 0 });
  });
});
