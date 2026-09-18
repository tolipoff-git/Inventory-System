import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { Store } from '../src/storage/store';
import { AppDB } from '../src/storage/indexedDb';
import { mergePersonnel, mergeSettings, mergeSyncPayloads } from '../src/sync/conflictResolver';
import { REGISTRY_KEYS, RegistryEvents } from '../src/types/registry';
import { Employee } from '../src/types/personnel';
import { SyncPayload } from '../src/types/sync';

globalThis.indexedDB = new IDBFactory();
AppDB._db = null;
AppDB._failed = false;

const origErr = console.error;
console.error = (msg: unknown, ...rest: unknown[]) => {
  const s = String(msg);
  if (s.includes('[AppDB') || s.includes('IndexedDB')) return;
  origErr.call(console, msg, ...rest);
};

async function freshStore(): Promise<void> {
  // A brand-new IDBFactory per test: fake-indexeddb otherwise keeps the same
  // `inv_inventory_db` across tests in this file, so `Store.init()` would reload
  // the previous test's persisted state.
  globalThis.indexedDB = new IDBFactory();
  AppDB._db = null;
  AppDB._failed = false;
  Store.tools = [];
  Store.personnel = [];
  Store.users = [];
  Store.auditLog = [];
  Store.workstations = [];
  Store.workposts = [];
  Store.programs = [];
  Store.wsProgram = {};
  Store.registryEvents = {};
  Store.audits5s = [];
  Store.meta = { schemaVersion: Store.meta.schemaVersion };
  Store.labelQueue = [];
  await Store.init();
}

beforeEach(async () => {
  await freshStore();
});

function emp(id: string, updatedAt: string, deletedAt?: string): Employee {
  return { id, name: `Emp ${id}`, role: 'Operator', updatedAt, deletedAt };
}

function payload(settings: Record<string, any>): SyncPayload {
  return {
    tools: [],
    procurementLog: [],
    personnel: [],
    settings,
    auditLog: [],
    deviceId: 'dev-A',
    updatedAt: '2026-09-01T00:00:00Z',
    version: 1,
  };
}

describe('personnel tombstones (soft delete survives the merge)', () => {
  it('a newer tombstone beats a stale live copy from a peer', () => {
    const local = [emp('EMP-1', '2026-09-10T12:00:00Z', '2026-09-10T12:00:00Z')];
    const remote = [emp('EMP-1', '2026-09-01T08:00:00Z')];

    const merged = mergePersonnel(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].deletedAt).toBe('2026-09-10T12:00:00Z');
  });

  it('a newer edit after the deletion still wins (explicit resurrection)', () => {
    const local = [emp('EMP-2', '2026-09-10T12:00:00Z', '2026-09-10T12:00:00Z')];
    const remote = [{ ...emp('EMP-2', '2026-09-11T09:00:00Z'), name: 'Re-hired' }];

    const merged = mergePersonnel(local, remote);
    expect(merged[0].deletedAt).toBeUndefined();
    expect(merged[0].name).toBe('Re-hired');
  });

  it('a tombstone with no updatedAt still counts as a revision', () => {
    const local: Employee[] = [{ id: 'EMP-3', name: 'Ghost', role: 'Operator', deletedAt: '2026-09-10T12:00:00Z' }];
    const remote = [emp('EMP-3', '2026-09-01T08:00:00Z')];

    const merged = mergePersonnel(local, remote);
    expect(merged[0].deletedAt).toBe('2026-09-10T12:00:00Z');
  });
});

describe('registry tombstone merge', () => {
  const key = REGISTRY_KEYS.workstation('WS-GHOST');

  it('keeps the newest event per key, remote winning ties', () => {
    const local: RegistryEvents = { [key]: { t: '2026-09-10T12:00:00Z', del: true } };
    const remote: RegistryEvents = { [key]: { t: '2026-09-12T08:00:00Z', del: false } };
    expect(mergeSettings({ registryEvents: local }, { registryEvents: remote }).registryEvents[key])
      .toEqual({ t: '2026-09-12T08:00:00Z', del: false });

    const tieLocal: RegistryEvents = { [key]: { t: '2026-09-12T08:00:00Z', del: false } };
    const tieRemote: RegistryEvents = { [key]: { t: '2026-09-12T08:00:00Z', del: true } };
    expect(mergeSettings({ registryEvents: tieLocal }, { registryEvents: tieRemote }).registryEvents[key])
      .toEqual({ t: '2026-09-12T08:00:00Z', del: true });
  });

  it('survives a full payload merge (union of arrays + tombstones)', () => {
    const local = payload({ workstations: [], registryEvents: { [key]: { t: '2026-09-10T12:00:00Z', del: true } } });
    const remote = payload({ workstations: ['WS-GHOST', 'WS-A'] });

    const merged = mergeSyncPayloads(local, remote);
    expect(merged.settings.workstations).toContain('WS-GHOST');
    expect(merged.settings.registryEvents[key].del).toBe(true);
  });
});

describe('Store applies tombstones on load/merge and on re-add', () => {
  it('drops a resurrected station pushed by a peer', () => {
    const key = REGISTRY_KEYS.workstation('WS-GHOST');
    Store.applyLoadedData({
      workstations: ['WS-A', 'WS-GHOST'],
      workposts: [{ name: 'P1', ws: 'WS-GHOST' }, { name: 'P2', ws: 'WS-A' }],
      programs: [],
      registryEvents: { [key]: { t: '2026-09-10T12:00:00Z', del: true } },
    });

    expect(Store.workstations).toEqual(['WS-A']);
    expect(Store.workposts).toEqual([{ name: 'P2', ws: 'WS-A' }]);
  });

  it('removeWorkstation tombstones the station, its posts and its program link', () => {
    Store.applyLoadedData({ workstations: ['WS-A'], workposts: [], programs: [], registryEvents: {} });
    Store.wsProgram = { 'WS-A': 'Prog-1' };
    Store.addWorkpost('P1', 'WS-A');

    Store.removeWorkstation('WS-A');

    expect(Store.registryEvents[REGISTRY_KEYS.workstation('WS-A')].del).toBe(true);
    expect(Store.registryEvents[REGISTRY_KEYS.workpost('P1', 'WS-A')].del).toBe(true);
    expect(Store.registryEvents[REGISTRY_KEYS.wsProgram('WS-A')].del).toBe(true);

    // A peer still holding the old array cannot bring it back.
    Store.applyLoadedData({
      workstations: ['WS-A'],
      workposts: [{ name: 'P1', ws: 'WS-A' }],
      wsProgram: { 'WS-A': 'Prog-1' },
      programs: [],
      registryEvents: Store.registryEvents,
    });
    expect(Store.workstations).toEqual([]);
    expect(Store.workposts).toEqual([]);
    expect(Store.wsProgram['WS-A']).toBeUndefined();
  });

  it('re-adding a removed station clears the tombstone with a newer event', () => {
    Store.applyLoadedData({
      workstations: ['WS-A'],
      workposts: [],
      programs: [],
      registryEvents: { [REGISTRY_KEYS.workstation('WS-A')]: { t: '2026-09-10T12:00:00Z', del: true } },
    });
    expect(Store.workstations).toEqual([]);

    Store.addWorkstation('WS-A', null);
    expect(Store.workstations).toEqual(['WS-A']);
    expect(Store.registryEvents[REGISTRY_KEYS.workstation('WS-A')].del).toBe(false);

    // Reload with the peer's *older* tombstone: the re-add must still win.
    Store.applyLoadedData({
      workstations: ['WS-A'],
      workposts: [],
      programs: [],
      registryEvents: mergeSettings(
        { registryEvents: Store.registryEvents },
        { registryEvents: { [REGISTRY_KEYS.workstation('WS-A')]: { t: '2026-09-10T12:00:00Z', del: true } } }
      ).registryEvents,
    });
    expect(Store.workstations).toEqual(['WS-A']);
  });

  it('renaming a station retires the old post keys instead of duplicating them', () => {
    Store.applyLoadedData({ workstations: ['WS-A'], workposts: [{ name: 'P1', ws: 'WS-A' }], programs: [], registryEvents: {} });
    Store.renameWorkstation('WS-A', 'WS-B');

    expect(Store.registryEvents[REGISTRY_KEYS.workpost('P1', 'WS-A')].del).toBe(true);
    expect(Store.registryEvents[REGISTRY_KEYS.workpost('P1', 'WS-B')].del).toBe(false);

    Store.applyLoadedData({
      workstations: ['WS-A', 'WS-B'],
      workposts: [{ name: 'P1', ws: 'WS-A' }, { name: 'P1', ws: 'WS-B' }],
      programs: [],
      registryEvents: Store.registryEvents,
    });
    expect(Store.workstations).toEqual(['WS-B']);
    expect(Store.workposts).toEqual([{ name: 'P1', ws: 'WS-B' }]);
  });
});

describe('personnel soft delete through the Store', () => {
  it('removePersonnel tombstones the row and hides it from active lists', async () => {
    Store.personnel = [emp('EMP-9', '2026-09-01T00:00:00Z')];
    expect(Store.activePersonnel().map(e => e.id)).toEqual(['EMP-9']);

    expect(Store.removePersonnel('EMP-9')).toBe(true);

    expect(Store.activePersonnel()).toEqual([]);
    // The record is still resolvable, so tool history keeps real names.
    expect(Store.getEmp('EMP-9')?.deletedAt).toBeTruthy();
    // …and the tombstone is persisted.
    Store.personnel = [];
    await Store.load();
    expect(Store.getEmp('EMP-9')?.deletedAt).toBeTruthy();
  });
});

describe('updatedAt coverage — every mutation path advances the sync clock', () => {
  it('stamps a tool edited in place and leaves untouched tools alone', async () => {
    const tool = Store.tools[0];
    const other = Store.tools[1];
    const before = other.updatedAt;

    tool.name = 'Renamed Without touch()';
    await Store.save();

    expect(tool.updatedAt).toBeTruthy();
    expect(other.updatedAt).toBe(before);
  });

  it('does not re-stamp records that did not change', async () => {
    const tool = Store.tools[0];
    tool.name = 'Edited once';
    await Store.save();
    const stamped = tool.updatedAt;

    await Store.save();
    expect(tool.updatedAt).toBe(stamped);
  });

  it('stamps a personnel record edited through the registry form', async () => {
    Store.personnel = [emp('EMP-7', '2026-09-01T00:00:00Z')];
    Store.personnel[0].post = 'Assembly';
    await Store.save();
    expect(Store.personnel[0].updatedAt).not.toBe('2026-09-01T00:00:00Z');
  });
});
