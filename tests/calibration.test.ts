import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { Store } from '../src/storage/store';
import { AppDB } from '../src/storage/indexedDb';
import { Tool } from '../src/types/inventory';
import { parseScanPayload } from '../src/utils/scanPayload';
import { calDueFrom, recordCalibration, recordCalibrationBatch, completeMaintenance, toolMatchesQuery, requiresCalibration, checkoutTool } from '../src/operations/toolOps';
import { renderLabelCell } from '../src/labels/labelPrint';
import { CONFIG } from '../src/config/constants';
import { verifierOptionsHtml, defaultVerifier } from '../src/utils/personnelPicker';

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

describe('parseScanPayload', () => {
  it('resolves a tool label URL to a tool id', () => {
    expect(parseScanPayload('https://inventory-system.tolipoff.workers.dev/?tool=TW-001'))
      .toEqual({ kind: 'tool', value: 'TW-001' });
  });

  it('resolves a location label URL to a location id', () => {
    const url = 'https://inventory-system.tolipoff.workers.dev/?loc=' + encodeURIComponent('LOC:rack:A:Rack A:Shelf 2:Bin 3');
    expect(parseScanPayload(url)).toEqual({ kind: 'location', value: 'LOC:rack:A:Rack A:Shelf 2:Bin 3' });
  });

  it('accepts the legacy ?id= / ?name= aliases', () => {
    expect(parseScanPayload('https://x/?id=SK-100')).toEqual({ kind: 'tool', value: 'SK-100' });
    expect(parseScanPayload('https://x/?name=LOC:shelf:Z')).toEqual({ kind: 'location', value: 'LOC:shelf:Z' });
  });

  it('accepts a bare query fragment (no scheme)', () => {
    expect(parseScanPayload('?tool=TW-002')).toEqual({ kind: 'tool', value: 'TW-002' });
  });

  it('accepts a bare LOC: id and a bare tool id', () => {
    expect(parseScanPayload('LOC:rack:A:Rack A:Shelf 2:Bin 3')).toEqual({ kind: 'location', value: 'LOC:rack:A:Rack A:Shelf 2:Bin 3' });
    expect(parseScanPayload('CRIMP-12')).toEqual({ kind: 'tool', value: 'CRIMP-12' });
  });

  it('falls back to raw for anything unrecognized', () => {
    expect(parseScanPayload('hello world')).toEqual({ kind: 'raw', value: 'hello world' });
    expect(parseScanPayload('')).toEqual({ kind: 'raw', value: '' });
  });
});

describe('calDueFrom', () => {
  it('adds calendar days across DST and positive/negative timezones', () => {
    const original = process.env.TZ;
    try {
      for (const tz of ['UTC', 'Asia/Tokyo', 'America/New_York', 'Europe/Berlin']) {
        process.env.TZ = tz;
        expect(calDueFrom('2026-03-07', 2), tz).toBe('2026-03-09');
        expect(calDueFrom('2026-10-31', 2), tz).toBe('2026-11-02');
        expect(calDueFrom('2028-02-28', 1), tz).toBe('2028-02-29');
      }
    } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
    expect(calDueFrom('2026-02-30', 1)).toBeUndefined();
    expect(calDueFrom('2026-01-01', 1.5)).toBeUndefined();
  });
  it('adds the interval in days to the verification date', () => {
    expect(calDueFrom('2026-01-01', 180)).toBe('2026-06-30');
  });

  it('returns undefined without a usable interval', () => {
    expect(calDueFrom('2026-01-01', 0)).toBeUndefined();
    expect(calDueFrom('2026-01-01', undefined)).toBeUndefined();
  });
});

describe('recordCalibration', () => {
  it('keeps new calibration audit entries when the audit log is full', async () => {
    Store.tools = [tool({ id: 'TW-1' })];
    for (let i = 0; i < CONFIG.AUDIT_LOG_LIMIT; i++) Store.log('OLD', String(i));
    await recordCalibration('TW-1', { by: 'Ivanov' });
    expect(Store.auditLog).toHaveLength(CONFIG.AUDIT_LOG_LIMIT);
    expect(Store.auditLog[0].action).toBe('TOOL_CALIBRATION');
  });
  it('clears stale certificates and validity for FAIL/FLAG and prevents checkout', async () => {
    Store.tools = [tool({ id: 'TW-1', calCertNo: 'OLD', calDue: '2027-01-01' })];
    for (const result of ['FAIL', 'FLAG'] as const) {
      await recordCalibration('TW-1', { by: 'Ivanov', date: '2026-01-01', intervalDays: 180, result });
      const t = Store.getTool('TW-1')!;
      expect(t.calDue).toBeNull();
      expect(t.calCertNo).toBeUndefined();
      const tag = renderLabelCell('calTagSheet', t.id, 'tool');
      expect(tag).toContain(result);
      expect(tag).not.toContain('OLD');
      expect(tag).not.toContain('1/1/2027');
      expect((await checkoutTool('TW-1', 'Ivanov')).success).toBe(false);
    }
    await recordCalibration('TW-1', { by: 'Ivanov', date: '2026-01-02', intervalDays: 180 });
    expect((await checkoutTool('TW-1', 'Ivanov')).success).toBe(true);
  });

  it('rejects invalid form data before changing a tool', async () => {
    Store.tools = [tool({ id: 'TW-1' })];
    for (const input of [{ by: '' }, { by: 'Ivanov', date: '2026-02-30' }, { by: 'Ivanov', intervalDays: 1.5 }, { by: 'Ivanov', intervalDays: 0 }, { by: 'Ivanov', intervalDays: Infinity }]) {
      await expect(recordCalibration('TW-1', input)).rejects.toThrow();
      expect(Store.tools[0].calHistory).toBeUndefined();
    }
  });

  it('rolls back an unsuccessful save so retry cannot duplicate history', async () => {
    Store.tools = [tool({ id: 'TW-1' })];
    const before = structuredClone(Store.tools[0]);
    const save = vi.spyOn(Store, 'save').mockRejectedValueOnce(new Error('disk full'));
    await expect(recordCalibration('TW-1', { by: 'Ivanov' })).rejects.toThrow('disk full');
    expect(Store.tools[0]).toEqual(before);
    expect(Store.auditLog.some(l => l.action === 'TOOL_CALIBRATION')).toBe(false);
    save.mockRestore();
    await recordCalibration('TW-1', { by: 'Ivanov' });
    expect(Store.tools[0].calHistory).toHaveLength(1);
  });
  it('stamps the structured verification fields and rolls calDue forward', async () => {
    Store.tools = [tool({ id: 'CRIMP-1' })];

    const ok = await recordCalibration('CRIMP-1', {
      by: 'Ivanov',
      date: '2026-01-01',
      intervalDays: 180,
      certNo: 'CERT-42',
      result: 'PASS',
    });

    expect(ok).toBe(true);
    const t = Store.getTool('CRIMP-1')!;
    expect(t.calVerifiedAt).toBe('2026-01-01');
    expect(t.calVerifiedBy).toBe('Ivanov');
    expect(t.calIntervalDays).toBe(180);
    expect(t.calCertNo).toBe('CERT-42');
    expect(t.calDue).toBe('2026-06-30');
    expect(t.calHistory).toHaveLength(1);
    expect(t.calHistory![0]).toMatchObject({ date: '2026-01-01', by: 'Ivanov', result: 'PASS', nextDue: '2026-06-30' });
    expect(Store.auditLog.find(l => l.action === 'TOOL_CALIBRATION')).toBeTruthy();
  });

  it('works on an Active tool (a freshly installed tool is not in Maintenance)', async () => {
    Store.tools = [tool({ id: 'CRIMP-2', status: 'Active' })];
    expect(await recordCalibration('CRIMP-2', { by: 'Petrov', date: '2026-02-01', intervalDays: 365 })).toBe(true);
    expect(Store.getTool('CRIMP-2')!.calDue).toBe('2027-02-01');
  });

  it('returns false for an unknown tool', async () => {
    expect(await recordCalibration('NOPE-1', {})).toBe(false);
  });
});

describe('recordCalibrationBatch', () => {
  it('deduplicates selections and excludes retired tools', async () => {
    Store.tools = [tool({ id: 'TW-1' }), tool({ id: 'TW-2', status: 'Decommissioned' })];
    expect(await recordCalibrationBatch(['TW-1', 'TW-1', 'TW-2'], { by: 'Ivanov' })).toEqual(['TW-1']);
    expect(Store.tools[0].calHistory).toHaveLength(1);
    expect(Store.tools[1].calHistory).toBeUndefined();
  });

  it('validates every selected interval before starting a batch', async () => {
    Store.tools = [tool({ id: 'TW-1', calIntervalDays: 180 }), tool({ id: 'TW-2', calIntervalDays: -1 })];
    await expect(recordCalibrationBatch(['TW-1', 'TW-2'], { by: 'Ivanov' })).rejects.toThrow();
    expect(Store.tools.every(t => !t.calHistory)).toBe(true);
  });
  it('stamps every selected tool with the same session data', async () => {
    Store.tools = [tool({ id: 'CRIMP-1' }), tool({ id: 'CRIMP-2' }), tool({ id: 'CRIMP-3' })];

    const updated = await recordCalibrationBatch(['CRIMP-1', 'CRIMP-2', 'MISSING-9'], {
      by: 'Ivanov',
      date: '2026-03-01',
      intervalDays: 90,
    });

    expect(updated).toEqual(['CRIMP-1', 'CRIMP-2']);
    expect(Store.getTool('CRIMP-1')!.calDue).toBe('2026-05-30');
    expect(Store.getTool('CRIMP-2')!.calVerifiedBy).toBe('Ivanov');
    expect(Store.getTool('CRIMP-3')!.calVerifiedAt).toBeUndefined();
    expect(Store.auditLog.find(l => l.action === 'TOOL_CALIBRATION_BATCH')).toBeTruthy();
  });
});

describe('toolMatchesQuery (cross-register search)', () => {
  it('finds a wrench by its class name, which only lives in the id prefix', () => {
    const t = tool({ id: 'TW-001', name: '1/2 in Wrench', category: 'Hand Tools' });
    // "Torque Wrench" is the TW class label — not stored in name/category.
    expect(toolMatchesQuery(t, 'Torq')).toBe(true);
    expect(toolMatchesQuery(t, 'torque')).toBe(true);
    expect(toolMatchesQuery(t, 'TORQUE WRENCH')).toBe(true);
  });

  it('is multi-token and order-independent', () => {
    const t = tool({ id: 'TW-002', name: '1/2 in Torque Wrench' });
    expect(toolMatchesQuery(t, 'torq 1/2')).toBe(true);
    expect(toolMatchesQuery(t, '1/2 torq')).toBe(true);
    expect(toolMatchesQuery(t, 'torq 3/4')).toBe(false);
  });

  it('searches category, spec, program, SN, article, station and holder', () => {
    Store.tools = [tool({
      id: 'CT-100',
      name: 'Crimper',
      category: 'Electrical',
      spec: '0.5-6 mm²',
      program: 'ITPS',
      sn: 'SN-ABC123',
      article: 'PART-9000',
      location: 'ITPS / VRC',
      assigneeId: 'EMP-1',
    })];
    Store.personnel = [{ id: 'EMP-1', name: 'Ivanov Ivan', role: 'Operator' }];

    for (const q of ['electrical', '0.5-6', 'itps', 'abc123', 'part-9000', 'vrc', 'ivanov']) {
      expect(toolMatchesQuery(Store.tools[0], q), `query: ${q}`).toBe(true);
    }
    expect(toolMatchesQuery(Store.tools[0], 'nonexistent')).toBe(false);
  });

  it('matches everything on an empty query', () => {
    expect(toolMatchesQuery(tool({ id: 'TW-003' }), '')).toBe(true);
    expect(toolMatchesQuery(tool({ id: 'TW-003' }), '   ')).toBe(true);
  });
});

describe('requiresCalibration (button gating)', () => {
  it('recognizes explicitly scheduled or verified screwdrivers outside the default class prefixes', () => {
    expect(requiresCalibration(tool({ id: 'SD-001', calIntervalDays: 180 }))).toBe(true);
    expect(requiresCalibration(tool({ id: 'CUSTOM-001', calVerifiedAt: '2026-01-01' }))).toBe(true);
    expect(requiresCalibration(tool({ id: 'TWIN-001' }))).toBe(false);
  });
  it('is true only for verification classes', () => {
    for (const id of ['TW-001', 'CT-100', 'DC-100', 'CA-100', 'GA-100']) {
      expect(requiresCalibration(tool({ id })), id).toBe(true);
    }
    // Socket head, hand tool, consumable — no calibration tag.
    for (const id of ['SK-100', 'HT-100', 'BW-100', 'PB-100', 'CN-100']) {
      expect(requiresCalibration(tool({ id })), id).toBe(false);
    }
  });
});

describe('verifier picker', () => {
  it('lists active personnel and preselects the recorded verifier', () => {
    Store.personnel = [
      { id: 'EMP-1', name: 'Igor Tolipov', role: 'Administrator' },
      { id: 'EMP-2', name: 'Ivan Petrov', role: 'Operator' },
    ];

    const html = verifierOptionsHtml('Igor Tolipov');
    expect(html).toContain('>Igor Tolipov<');
    expect(html).toContain('>Ivan Petrov<');
    expect(html).toContain('value="Igor Tolipov" selected');
    expect(html).toContain('value=""');
  });

  it('defaults to the recorded verifier and otherwise stays empty', () => {
    Store.personnel = [{ id: 'EMP-1', name: 'Igor Tolipov', role: 'Administrator' }];
    expect(defaultVerifier('Igor Tolipov')).toBe('Igor Tolipov');
    // 'admin' is not a person in the registry, so no person is auto-selected.
    expect(defaultVerifier('')).toBe('');
  });
});

describe('completeMaintenance with calibration input', () => {
  it('records who verified and when, and computes the next due from the interval', async () => {
    Store.tools = [tool({ id: 'CRIMP-4', status: 'Maintenance' })];

    const ok = await completeMaintenance('CRIMP-4', 'Calibrated to ±2%', undefined, {
      by: 'Sidorov',
      date: '2026-04-01',
      intervalDays: 180,
      certNo: 'CERT-7',
    });

    expect(ok).toBe(true);
    const t = Store.getTool('CRIMP-4')!;
    expect(t.status).toBe('Active');
    expect(t.calVerifiedAt).toBe('2026-04-01');
    expect(t.calVerifiedBy).toBe('Sidorov');
    expect(t.calDue).toBe('2026-09-28');
    expect(t.calHistory).toHaveLength(1);
  });
});
