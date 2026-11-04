// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncPayload } from '../src/types/sync';

vi.mock('../src/sync/syncApi', async original => ({
  ...await original<typeof import('../src/sync/syncApi')>(),
  pullSyncPayload: vi.fn(), pushSyncPayload: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
}));
vi.mock('../src/sync/liveRelay', () => ({ subscribeToLiveCloudStream: vi.fn(() => () => {}), broadcastPing: vi.fn().mockResolvedValue(undefined) }));
const payload = (name = 'remote'): SyncPayload => ({
  tools: [{ id: 'TW-001', name, type: 'Permanent', category: 'Hand Tools', status: 'Active', location: 'Crib', qty: 1, updatedAt: '2026-11-01T00:00:00Z' }],
  personnel: [], procurementLog: [], auditLog: [], settings: { workstations: ['Crib'], workposts: [], programs: [], wsProgram: {} },
  deviceId: 'remote', updatedAt: '2026-11-01T01:00:00Z', version: 1, room: 'ROOM-A',
});
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
async function modules() {
  const { Store } = await import('../src/storage/store');
  const { SyncManagerInstance: sync } = await import('../src/sync/syncManager');
  const api = await import('../src/sync/syncApi');
  const { AppDB } = await import('../src/storage/indexedDb');
  const snapshots = new Map<string, unknown>();
  vi.spyOn(AppDB, 'setSetting').mockImplementation(async (key, value) => { snapshots.set(key, structuredClone(value)); });
  vi.spyOn(AppDB, 'getSetting').mockImplementation(async key => snapshots.get(key) ?? null);
  Store.applyLoadedData({ tools: structuredClone(payload().tools), users: [{ username: 'custom', pwHash: 'configured-hash', role: 'Administrator' }], labelQueue: ['TW-001'] });
  vi.spyOn(Store, 'save').mockResolvedValue(undefined);
  sync.room = 'ROOM-A';
  vi.mocked(api.pullSyncPayload).mockResolvedValue({ kind: 'ok', payload: payload() });
  return { Store, sync, api };
}
describe('audit: sync invariants', () => {
  it('remote pull preserves local accounts and label queue', async () => {
    const { Store, sync } = await modules();
    await sync.triggerPull();
    expect(Store.users.map(u => u.username)).toEqual(['custom']);
    expect(Store.labelQueue).toEqual(['TW-001']);
  });
  it('empty tool state stays empty instead of introducing demo records', async () => {
    const { Store } = await modules();
    Store.applyLoadedData({ tools: [], users: [], workstations: [] });
    expect(Store.tools).toEqual([]);
  });
  it('a changed target room does not absorb inventory from the previous room', async () => {
    const { Store, sync, api } = await modules();
    const remote = payload('room B'); remote.tools[0].id = 'TW-B'; remote.room = 'ROOM-B';
    vi.mocked(api.pullSyncPayload).mockResolvedValue({ kind: 'ok', payload: remote });
    await sync.changeRoom('ROOM-B');
    expect(Store.tools.map(t => t.id)).toEqual(['TW-B']);
  });
  it('an in-flight response from a previous room cannot modify the new room', async () => {
    const { Store, sync, api } = await modules();
    let finish!: (value: Awaited<ReturnType<typeof api.pullSyncPayload>>) => void;
    vi.mocked(api.pullSyncPayload).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const oldPull = sync.triggerPull();
    const remote = payload('room B'); remote.room = 'ROOM-B'; remote.updatedAt = '2026-11-02T00:00:00Z';
    vi.mocked(api.pullSyncPayload).mockResolvedValueOnce({ kind: 'ok', payload: remote });
    await sync.changeRoom('ROOM-B');
    finish({ kind: 'ok', payload: payload('stale room A') });
    await oldPull;
    expect(Store.tools.find(t => t.id === 'TW-001')?.name).toBe('room B');
  });
  it('sends an offline edit after reconnection instead of reporting a clean pull', async () => {
    vi.useFakeTimers();
    const { Store, sync, api } = await modules();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    sync.init();
    await vi.advanceTimersByTimeAsync(500);
    Store.tools[0].name = 'offline edit';
    Store.tools[0].updatedAt = new Date().toISOString();
    Store.notify();
    expect(localStorage.getItem(`inv_sync_dirty_${sync.room}`)).toBe('1');
    online.mockReturnValue(true);
    expect(await sync.forceSync()).toBe(true);
    expect(vi.mocked(api.pushSyncPayload).mock.calls[0][1].tools[0].name).toBe('offline edit');
    expect(localStorage.getItem(`inv_sync_dirty_${sync.room}`)).toBe('0');
  });
  it('a local save while a push is pending gets a trailing push', async () => {
    vi.useFakeTimers();
    const { Store, sync, api } = await modules();
    vi.mocked(api.pullSyncPayload).mockResolvedValue({ kind: 'empty' });
    sync.init();
    await vi.advanceTimersByTimeAsync(500);
    let finish!: (value: { ok: boolean; status: number }) => void;
    vi.mocked(api.pushSyncPayload).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = sync.triggerPush();
    Store.tools[0].name = 'later change';
    Store.tools[0].updatedAt = new Date().toISOString();
    Store.notify();
    await vi.advanceTimersByTimeAsync(1300);
    finish({ ok: true, status: 200 });
    await first;
    await vi.advanceTimersByTimeAsync(1300);
    expect(api.pushSyncPayload).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.pushSyncPayload).mock.calls[1][1].tools[0].name).toBe('later change');
  });
});
