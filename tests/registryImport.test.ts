import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { Store } from '../src/storage/store';
import { AppDB } from '../src/storage/indexedDb';
import { Tool } from '../src/types/inventory';
import { Employee } from '../src/types/personnel';

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
  Store.sops = [];
  Store.audits5s = [];
  Store.meta = { schemaVersion: Store.meta.schemaVersion };
  Store.labelQueue = [];
  await Store.init();
  // `init()` seeds SEED_TOOLS / SEED_WORKSTATIONS; clear them so each test owns
  // its own fixture (the seed tools themselves reference `USS / Center Conveyor`
  // and `Sub-Assembly / Station 4B`, which would otherwise be imported too).
  Store.tools = [];
  Store.personnel = [];
  Store.workstations = [];
  Store.workposts = [];
  Store.programs = [];
  Store.wsProgram = {};
  Store.registryEvents = {};
}

beforeEach(async () => {
  await freshStore();
});

function tool(on: Partial<Tool> & { id: string }): Tool {
  return {
    name: 'Tool',
    type: 'Permanent',
    category: 'Hand Tools',
    location: 'Shadow Board',
    status: 'Active',
    ...on,
  };
}

function emp(on: Partial<Employee> & { id: string }): Employee {
  return { name: 'Person', role: 'Operator', ...on };
}

describe('registry import from existing data', () => {
  it('registers stations and posts from personnel (the source the risk chart uses)', () => {
    Store.personnel = [
      emp({ id: 'EMP-1', ws: 'ITPS', post: 'VRC' }),
      emp({ id: 'EMP-2', ws: 'ITPS', post: 'VRC' }), // duplicate must collapse
      emp({ id: 'EMP-3', ws: 'USS', post: 'Center Conveyor' }),
    ];

    const res = Store.importRegistryFromData();

    expect(res.stations).toBe(2);
    expect(res.posts).toBe(2);
    expect(Store.workstations).toContain('ITPS');
    expect(Store.workstations).toContain('USS');
    expect(Store.postExists('VRC', 'ITPS')).toBe(true);
    expect(Store.postExists('Center Conveyor', 'USS')).toBe(true);
  });

  it('registers stations and posts from an explicit `station / post` tool location', () => {
    Store.tools = [tool({ id: 'SK-100', location: 'Sub-Assembly / Station 4B' })];

    const res = Store.importRegistryFromData();

    expect(res.stations).toBe(1);
    expect(Store.workstations).toContain('Sub-Assembly');
    expect(Store.postExists('Station 4B', 'Sub-Assembly')).toBe(true);
  });

  it('registers a station from the structured address zone', () => {
    Store.tools = [tool({ id: 'SK-101', location: 'Rack 3', address: { zone: 'Line 7' } })];

    Store.importRegistryFromData();

    expect(Store.workstations).toContain('Line 7');
  });

  it('does NOT register bare storage areas, and reports them instead', () => {
    Store.tools = [
      tool({ id: 'BW-100', location: 'Shadow Board' }),
      tool({ id: 'BW-101', location: 'Tool Crib' }),
      tool({ id: 'BW-102', location: 'Calibration Lab' }),
    ];

    const res = Store.importRegistryFromData();

    expect(res.stations).toBe(0);
    expect(Store.workstations).not.toContain('Shadow Board');
    expect(Store.workstations).not.toContain('Tool Crib');
    expect(res.skipped).toEqual(['Calibration Lab', 'Shadow Board', 'Tool Crib']);
  });

  it('creates programs declared on tools and links the station to them', () => {
    Store.tools = [
      tool({ id: 'SK-102', location: 'ITPS / VRC', program: 'ITPS' }),
      tool({ id: 'SK-103', location: 'ITPS / VRC', program: 'ITPS' }),
    ];

    const res = Store.importRegistryFromData();

    expect(res.programs).toBe(1);
    expect(res.links).toBe(1);
    expect(Store.programs).toContain('ITPS');
    expect(Store.wsProgram['ITPS']).toBe('ITPS');
  });

  it('is non-destructive: no tool or person is modified', () => {
    Store.personnel = [emp({ id: 'EMP-9', ws: 'ITPS', post: 'VRC' })];
    Store.tools = [tool({ id: 'SK-104', location: 'ITPS / VRC', assigneeId: 'EMP-9' })];

    Store.importRegistryFromData();

    // The references themselves must be untouched. (`updatedAt` may advance —
    // `Store.save()` stamps records that never had one, by design since v112.)
    expect(Store.tools[0].location).toBe('ITPS / VRC');
    expect(Store.tools[0].assigneeId).toBe('EMP-9');
    expect(Store.personnel[0].ws).toBe('ITPS');
    expect(Store.personnel[0].post).toBe('VRC');
  });

  it('is idempotent — a second run adds nothing', () => {
    Store.personnel = [emp({ id: 'EMP-1', ws: 'ITPS', post: 'VRC' })];
    Store.tools = [tool({ id: 'SK-105', location: 'USS / Center Conveyor', program: 'USS' })];

    const first = Store.importRegistryFromData();
    expect(first.stations).toBe(2);

    const second = Store.importRegistryFromData();
    expect(second.stations).toBe(0);
    expect(second.posts).toBe(0);
    expect(second.programs).toBe(0);
    expect(second.links).toBe(0);
  });

  it('ignores tombstoned personnel and placeholder station names', () => {
    Store.personnel = [
      emp({ id: 'EMP-1', ws: 'Ghost Line', deletedAt: '2026-09-01T00:00:00Z' }),
      emp({ id: 'EMP-2', ws: 'Unassigned' }),
      emp({ id: 'EMP-3', ws: 'Unknown' }),
      emp({ id: 'EMP-4', ws: '' }),
    ];

    const res = Store.importRegistryFromData();

    expect(res.stations).toBe(0);
    expect(Store.workstations).not.toContain('Ghost Line');
  });

  it('honours legacy monolith personnel fields', () => {
    Store.personnel = [{ id: 'EMP-1', name: 'Legacy', role: 'Operator', workstation: 'ITPS', defaultPost: 'VRC' } as Employee];

    Store.importRegistryFromData();

    expect(Store.workstations).toContain('ITPS');
    expect(Store.postExists('VRC', 'ITPS')).toBe(true);
  });

  it('pendingRegistryImport reports the same plan without changing anything', () => {
    Store.personnel = [emp({ id: 'EMP-1', ws: 'ITPS', post: 'VRC' })];

    const pending = Store.pendingRegistryImport();

    expect(pending.stations).toBe(1);
    expect(pending.stationNames).toEqual(['ITPS']);
    expect(Store.workstations).not.toContain('ITPS'); // still untouched
    expect(Store.rollbackInfo()).toBeNull();          // no snapshot taken
  });

  it('is undoable through the rollback snapshot', async () => {
    Store.personnel = [emp({ id: 'EMP-1', ws: 'ITPS', post: 'VRC' })];
    Store.importRegistryFromData();
    expect(Store.workstations).toContain('ITPS');

    expect(await Store.rollback()).toBe(true);
    expect(Store.workstations).not.toContain('ITPS');
  });

  it('logs the import to the audit trail', () => {
    Store.personnel = [emp({ id: 'EMP-1', ws: 'ITPS', post: 'VRC' })];
    Store.importRegistryFromData();

    const entry = Store.auditLog.find(l => l.action === 'REGISTRY_IMPORT');
    expect(entry).toBeTruthy();
    expect(entry?.details).toContain('stations: 1');
  });

  it('marks imported entries alive so a stale tombstone cannot prune them', () => {
    Store.registryEvents = { 'ws:ITPS': { t: '2026-09-01T00:00:00Z', del: true } };
    Store.personnel = [emp({ id: 'EMP-1', ws: 'ITPS', post: 'VRC' })];

    Store.importRegistryFromData();

    expect(Store.registryEvents['ws:ITPS'].del).toBe(false);
    // A reload must keep the imported station.
    Store.applyLoadedData({
      workstations: Store.workstations,
      workposts: Store.workposts,
      programs: Store.programs,
      registryEvents: Store.registryEvents,
    });
    expect(Store.workstations).toContain('ITPS');
  });
});