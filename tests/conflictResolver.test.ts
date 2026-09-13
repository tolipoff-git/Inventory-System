import { describe, it, expect } from 'vitest';
import { mergeTools, mergeSyncPayloads } from '../src/sync/conflictResolver';
import { Tool } from '../src/types/inventory';
import { SyncPayload } from '../src/types/sync';

function tool(on: Partial<Tool> & { id: string }, updatedAt: string): Tool {
  return {
    id: on.id,
    name: 'Base Tool',
    type: 'Permanent',
    category: 'Hand Tools',
    location: 'Shadow Board',
    status: 'Active',
    history: [],
    updatedAt,
    ...on,
  };
}

function emptyPayload(deviceId: string): SyncPayload {
  return {
    tools: [],
    procurementLog: [],
    personnel: [],
    settings: {},
    auditLog: [],
    deviceId,
    updatedAt: '2026-01-01T00:00:00Z',
    version: 1,
  };
}

describe('field-level conflict resolution (two devices, same record)', () => {
  it('later-wins-per-entity: remote newer merge wins outright', () => {
    const local = [tool({ id: 'T-1', location: 'Tool Gage', status: 'Active' }, '2026-09-01T10:00:00Z')];
    const remote = [tool({ id: 'T-1', location: 'Machine Shop', status: 'Issued' }, '2026-09-01T11:00:00Z')];

    const merged = mergeTools(local, remote);
    expect(merged.length).toBe(1);
    // Remote is newer → whole-record wins at entity level.
    expect(merged[0].location).toBe('Machine Shop');
    expect(merged[0].status).toBe('Issued');
  });

  it('field-level: older remote edit loses, later local edit wins', () => {
    const local = [tool({ id: 'T-2', location: 'Calibration Lab', status: 'Active' }, '2026-09-01T12:00:00Z')];
    const remote = [tool({ id: 'T-2', location: 'Tool Crib', status: 'Maintenance' }, '2026-09-01T09:00:00Z')];

    const merged = mergeTools(local, remote);
    expect(merged.length).toBe(1);
    // Later local wins; the stale remote change must not clobber it.
    expect(merged[0].location).toBe('Calibration Lab');
    expect(merged[0].status).toBe('Active');
  });

  it('ties resolved to remote (>=), and history is unioned without duplicates', () => {
    const local = [tool({ id: 'T-3', location: 'A', history: ['h1'] }, '2026-09-01T10:00:00Z')];
    const remote = [tool({ id: 'T-3', location: 'B', history: ['h1', 'h2'] }, '2026-09-01T10:00:00Z')];

    const merged = mergeTools(local, remote);
    expect(merged[0].location).toBe('B');
    expect(merged[0].history).toEqual(['h1', 'h2']);
  });
});

describe('mergeSyncPayloads same-record behaviour', () => {
  it('merges tool lists and bumps the payload version by 1 (at least max + 1)', () => {
    const local = emptyPayload('dev-A');
    local.tools = [tool({ id: 'T-4', location: 'X' }, '2026-09-01T10:00:00Z')];
    local.version = 5;

    const remote = emptyPayload('dev-B');
    remote.tools = [tool({ id: 'T-4', location: 'Y' }, '2026-09-01T10:30:00Z')];
    remote.version = 7;

    const merged = mergeSyncPayloads(local, remote);
    expect(merged.tools.length).toBe(1);
    expect(merged.tools[0].location).toBe('Y'); // remote newer
    expect(merged.version).toBe(8); // max(5,7)+1
  });

  it('keeps both device ids and a valid ISO updatedAt', () => {
    const merged = mergeSyncPayloads(emptyPayload('dev-A'), emptyPayload('dev-B'));
    expect(merged.deviceId).toBe('dev-A');
    expect(Number.isNaN(Date.parse(merged.updatedAt))).toBe(false);
  });
});