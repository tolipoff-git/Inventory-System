import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { Store } from '../src/storage/store';
import { AppDB } from '../src/storage/indexedDb';
import * as ops from '../src/operations/toolOps';
import { SEED_TOOLS } from '../src/storage/seedData';
import { Tool } from '../src/types/inventory';

// Point the app at the fake IndexedDB implementation (and re-open the connection
// so AppDB picks up the fresh in-memory database on each test file run).
globalThis.indexedDB = new IDBFactory();
AppDB._db = null;
AppDB._failed = false;

// Noise reduction for expected IDB errors during tests.
const origErr = console.error;
console.error = (msg: unknown, ...rest: unknown[]) => {
  const s = String(msg);
  if (s.includes('[AppDB') || s.includes('IndexedDB')) return;
  origErr.call(console, msg, ...rest);
};

async function freshStore(): Promise<void> {
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
  Store.audits5s = [];
  Store.meta = { schemaVersion: Store.meta.schemaVersion };
  Store.labelQueue = [];
  await Store.init();
}

function seedTool(on: Partial<Tool>): Tool {
  return { ...SEED_TOOLS[0], ...on };
}

beforeEach(async () => {
  await freshStore();
});

describe('store add-item (seed + persistence via real AppDB/fake-indexeddb)', () => {
  it('seeds the empty DB with SEED_TOOLS through Store.init/load', async () => {
    expect(Store.tools.length).toBe(SEED_TOOLS.length);
    expect(Store.getTool('BW-001')).toBeTruthy();
    expect(Store.workstations).toContain('Tool Gage');
  });

  it('adds a new tool via Store.saveTool and reloads it from the DB', async () => {
    const t = seedTool({ id: 'XX-999', name: 'Test Gauge' });
    await Store.saveTool(t);
    expect(Store.getTool('XX-999')?.name).toBe('Test Gauge');

    // Fresh load from persisted fake IDB — record must survive.
    Store.tools = [];
    await Store.load();
    expect(Store.getTool('XX-999')?.name).toBe('Test Gauge');
  });
});

describe('store quantity updates against real store logic', () => {
  it('checkout reduces parent qty and clones a consumed-issue tool', async () => {
    const t = seedTool({ id: 'CN-001', type: 'Consumable', qty: 15, minQty: 5 });
    await Store.saveTool(t);

    const res = await ops.checkoutTool('CN-001', 'EMP-TEST', 1, 3, 'TT');
    expect(res.success).toBe(true);

    const parent = Store.getTool('CN-001');
    expect(parent?.qty).toBe(12); // 15 - 3
    expect(Store.tools.some(x => x.id !== 'CN-001' && x.type === 'Consumable' && x.qty === 3)).toBe(true);
  });

  it('refuses checkout above available quantity', async () => {
    const t = seedTool({ id: 'CN-002', type: 'Consumable', qty: 2, minQty: 5 });
    await Store.saveTool(t);

    const res = await ops.checkoutTool('CN-002', 'EMP-TEST', 1, 9);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Cannot issue more than available quantity');
  });

  it('adjustConsumableQty clamps at zero and persists', async () => {
    const t = seedTool({ id: 'CN-003', type: 'Consumable', qty: 7, minQty: 5 });
    await Store.saveTool(t);

    expect(await ops.adjustConsumableQty('CN-003', -10, 'test')).toBe(true);
    expect(Store.getTool('CN-003')?.qty).toBe(0);

    expect(await ops.adjustConsumableQty('CN-003', 4, 'restock')).toBe(true);
    expect(Store.getTool('CN-003')?.qty).toBe(4);
  });
});

describe('rollback last cascade (registry snapshot)', () => {
  it('reports no snapshot before any cascade edit', () => {
    expect(Store.rollbackInfo()).toBeNull();
  });

  it('restores programs/workstations/personnel/tools to the snapshot', async () => {
    await freshStore();
    Store.workstations = ['WS-A', 'WS-B'];
    Store.programs = ['Prog-1'];
    Store.wsProgram = { 'WS-A': 'Prog-1' };
    Store.personnel = [{ id: 'EMP-1', name: 'Alice', role: 'Operator' }];
    Store.tools = [seedTool({ id: 'TW-001' })];

    // A cascade edit captures the snapshot before mutating.
    Store.renameProgram('Prog-1', 'Prog-2');
    expect(Store.programs).toEqual(['Prog-2']);
    expect(Store.wsProgram['WS-A']).toBe('Prog-2');

    const info = Store.rollbackInfo();
    expect(info).not.toBeNull();
    expect(info?.reason).toContain('rename program');

    // Further drift after the snapshot must also be undone.
    Store.programs.push('Prog-3');
    Store.workstations.push('WS-C');

    expect(await Store.rollback()).toBe(true);
    expect(Store.programs).toEqual(['Prog-1']);
    expect(Store.wsProgram['WS-A']).toBe('Prog-1');
    expect(Store.workstations).toEqual(['WS-A', 'WS-B']);
    expect(Store.personnel.map(p => p.id)).toEqual(['EMP-1']);
    expect(Store.tools.map(t => t.id)).toEqual(['TW-001']);
  });

  it('refuses to apply a corrupt snapshot instead of wiping data', async () => {
    await freshStore();
    Store.tools = [seedTool({ id: 'TW-002' })];
    Store.personnel = [{ id: 'EMP-2', name: 'Bob', role: 'Operator' }];

    // Simulate a corrupt persisted snapshot (tools/personnel not arrays).
    (Store as any)._rollbackSnap = { ts: '2026-01-01T00:00:00.000Z', reason: 'corrupt', tools: null, personnel: null };

    expect(await Store.rollback()).toBe(false);
    expect(Store.tools.map(t => t.id)).toEqual(['TW-002']);
    expect(Store.personnel.map(p => p.id)).toEqual(['EMP-2']);
  });
});