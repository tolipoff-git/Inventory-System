import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { Store } from '../src/storage/store';
import { AppDB } from '../src/storage/indexedDb';
import { SEED_SOPS } from '../src/storage/sopSeed';
import { mergeSops, mergeSettings, mergeSyncPayloads } from '../src/sync/conflictResolver';
import { SopDocument, appliesToLabel, appliesEverywhere } from '../src/types/sop';
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
}

beforeEach(async () => {
  await freshStore();
});

function sop(on: Partial<SopDocument> & { id: string }, updatedAt: string): SopDocument {
  return {
    titleEn: 'Title',
    titleRu: 'Название',
    bodyEn: '<p>en</p>',
    bodyRu: '<p>ru</p>',
    revision: '1',
    effectiveDate: '2026-01-01',
    approvedBy: 'A. Approver',
    ownerRole: 'Administrator',
    status: 'Approved',
    updatedAt,
    ...on,
  };
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

describe('seed standards', () => {
  it('seeds the four legacy SOPs on a fresh database', () => {
    expect(Store.sops.map(s => s.id)).toEqual(['SOP-GEN-00', 'SOP-TW-01', 'SOP-BT-02', 'SOP-PB-03']);
    expect(Store.getSop('SOP-TW-01')?.titleRu).toContain('динамометрическими');
  });

  it('every seeded document is bilingual and has control metadata', () => {
    SEED_SOPS.forEach(s => {
      expect(s.titleEn.length).toBeGreaterThan(0);
      expect(s.titleRu.length).toBeGreaterThan(0);
      expect(s.bodyEn.length).toBeGreaterThan(0);
      expect(s.bodyRu.length).toBeGreaterThan(0);
      expect(s.revision).toMatch(/^\d/);
      expect(s.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.approvedBy.length).toBeGreaterThan(0);
      expect(s.status).toBe('Approved');
    });
  });

  it('an edited document is not overwritten by the seed on reload', async () => {
    const gen = Store.getSop('SOP-GEN-00')!;
    await Store.saveSop({ ...gen, titleEn: 'Edited by the shop', revision: '4' });

    Store.sops = [];
    await Store.load();

    expect(Store.getSop('SOP-GEN-00')?.titleEn).toBe('Edited by the shop');
    expect(Store.getSop('SOP-GEN-00')?.revision).toBe('4');
  });
});

describe('controlled-document lifecycle', () => {
  it('saveSop upserts and stamps updatedAt', async () => {
    const before = Store.getSop('SOP-PB-03')!.updatedAt;
    await Store.saveSop({ ...Store.getSop('SOP-PB-03')!, approvedBy: 'New Approver' });

    const after = Store.getSop('SOP-PB-03')!;
    expect(after.approvedBy).toBe('New Approver');
    expect(after.updatedAt).toBeTruthy();
    expect(after.updatedAt).not.toBe(before);
    expect(Store.sops.filter(s => s.id === 'SOP-PB-03')).toHaveLength(1);
  });

  it('newSopRevision bumps the label, re-dates it and returns to Draft', async () => {
    const updated = await Store.newSopRevision('SOP-TW-01');
    expect(updated?.revision).toBe('3');
    expect(updated?.status).toBe('Draft');
    expect(updated?.effectiveDate).toBe(new Date().toISOString().split('T')[0]);
    expect(Store.approvedSops().some(s => s.id === 'SOP-TW-01')).toBe(false);
  });

  it('obsolete documents stay stored but leave the approved set', async () => {
    expect(await Store.setSopStatus('SOP-BT-02', 'Obsolete')).toBe(true);
    expect(Store.getSop('SOP-BT-02')?.status).toBe('Obsolete');
    expect(Store.approvedSops().map(s => s.id)).not.toContain('SOP-BT-02');
    expect(Store.sops).toHaveLength(4);
  });

  it('logs every standards change to the audit trail', async () => {
    await Store.saveSop({ ...Store.getSop('SOP-GEN-00')!, revision: '5' });
    await Store.setSopStatus('SOP-GEN-00', 'Obsolete');
    await Store.newSopRevision('SOP-GEN-00');

    const actions = Store.auditLog.map(l => l.action);
    expect(actions).toContain('SOP_SAVE');
    expect(actions).toContain('SOP_STATUS');
    expect(actions).toContain('SOP_REVISION');
  });
});

describe('standards sync merge', () => {
  it('unions by id and keeps the newest revision, remote winning ties', () => {
    const local = [sop({ id: 'SOP-A', revision: '1' }, '2026-09-01T10:00:00Z')];
    const remote = [sop({ id: 'SOP-A', revision: '2' }, '2026-09-02T10:00:00Z'), sop({ id: 'SOP-B' }, '2026-09-02T10:00:00Z')];

    const merged = mergeSops(local, remote);
    expect(merged.map(s => s.id).sort()).toEqual(['SOP-A', 'SOP-B']);
    expect(merged.find(s => s.id === 'SOP-A')?.revision).toBe('2');

    const tie = mergeSops(
      [sop({ id: 'SOP-C', revision: '1' }, '2026-09-03T10:00:00Z')],
      [sop({ id: 'SOP-C', revision: '9' }, '2026-09-03T10:00:00Z')]
    );
    expect(tie[0].revision).toBe('9');
  });

  it('travels through mergeSettings and a full payload merge', () => {
    const local = payload({ sops: [sop({ id: 'SOP-A', revision: '1' }, '2026-09-01T10:00:00Z')] });
    const remote = payload({ sops: [sop({ id: 'SOP-A', revision: '2' }, '2026-09-05T10:00:00Z')] });

    const merged = mergeSyncPayloads(local, remote);
    expect(merged.settings.sops).toHaveLength(1);
    expect(merged.settings.sops[0].revision).toBe('2');

    // A peer that never stored standards must not wipe ours.
    const withPeer = mergeSettings({ sops: [sop({ id: 'SOP-A' }, '2026-09-01T10:00:00Z')] }, {});
    expect(withPeer.sops).toHaveLength(1);
  });

  it('a peer holding an older copy cannot roll a revision back', () => {
    const local = [sop({ id: 'SOP-A', revision: '7' }, '2026-09-10T10:00:00Z')];
    const stale = [sop({ id: 'SOP-A', revision: '6' }, '2026-09-01T10:00:00Z')];
    expect(mergeSops(local, stale)[0].revision).toBe('7');
  });
});

describe('applicability labels', () => {
  it('reports unrestricted documents as applying everywhere', () => {
    const all = sop({ id: 'SOP-X' }, '2026-09-01T10:00:00Z');
    expect(appliesEverywhere(all)).toBe(true);
    expect(appliesToLabel(all, 'ENG')).toBe('All areas');
    expect(appliesToLabel(all, 'RU')).toBe('Везде');
  });

  it('joins the configured scopes', () => {
    const scoped = sop({ id: 'SOP-Y', appliesTo: { toolClasses: ['TW'], stations: ['Line 1'] } }, '2026-09-01T10:00:00Z');
    expect(appliesEverywhere(scoped)).toBe(false);
    expect(appliesToLabel(scoped, 'ENG')).toBe('TW · Line 1');
  });
});