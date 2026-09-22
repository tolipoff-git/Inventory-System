import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { Store } from '../src/storage/store';
import { AppDB } from '../src/storage/indexedDb';
import { Tool } from '../src/types/inventory';
import { fmtDate, d } from '../src/utils/formatters';
import { addrLine, buildLabelSheetHtml } from '../src/labels/labelPrint';
import { buildBinOptions, isBinOccupied } from '../src/ui/components/binOptions';
import { passportRecords } from '../src/operations/toolOps';

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
  await Store.init();
  Store.tools = [];
  Store.personnel = [];
  Store.workstations = [];
  Store.workposts = [];
}

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

describe('fmtDate — date-only values are local, not UTC', () => {
  it('keeps the calendar day of a `YYYY-MM-DD` string', () => {
    // `new Date('2026-09-18')` is UTC midnight, which rendered as 9/17 in every
    // timezone behind UTC (the verification tag printed yesterday's date).
    expect(fmtDate('2026-09-18')).toBe('9/18/2026');
    expect(fmtDate('2026-01-01')).toBe('1/1/2026');
    expect(fmtDate('2026-12-31')).toBe('12/31/2026');
  });

  it('parses a date-only string to local midnight', () => {
    const parsed = d('2026-09-18');
    expect(parsed).not.toBeNull();
    expect(parsed!.getFullYear()).toBe(2026);
    expect(parsed!.getMonth()).toBe(8);
    expect(parsed!.getDate()).toBe(18);
    expect(parsed!.getHours()).toBe(0);
  });

  it('still handles full timestamps and rejects junk', () => {
    expect(d('2026-09-18T10:30:00.000Z')).toBeInstanceOf(Date);
    expect(d('not-a-date')).toBeNull();
    expect(d(null)).toBeNull();
  });
});

describe('addrLine — Rack / Shelf / Bin are always spelled out', () => {
  it('spells out bare legacy values', () => {
    const t = tool({ id: 'TW-001', address: { zone: '', rack: 'A', shelf: '2', bin: '3' } });
    expect(addrLine(t)).toBe('Rack A | Shelf 2 | Bin 3');
  });

  it('does not double the word when it is already present', () => {
    const t = tool({ id: 'TW-002', address: { zone: '', rack: 'Rack A', shelf: 'Shelf 2', bin: 'Bin 3' } });
    expect(addrLine(t)).toBe('Rack A | Shelf 2 | Bin 3');
  });

  it('skips empty components and falls back to the free-text location', () => {
    const partial = tool({ id: 'TW-003', address: { zone: '', rack: 'B', shelf: '', bin: '4' } });
    expect(addrLine(partial)).toBe('Rack B | Bin 4');

    const none = tool({ id: 'TW-004', location: 'Tool Crib', address: { zone: '', rack: '', shelf: '', bin: '' } });
    expect(addrLine(none)).toBe('Tool Crib');
  });
});

describe('passportRecords — verification is read from calHistory, not audit_history', () => {
  it('fills who / when / result / notes from the structured verification log', () => {
    const t = tool({
      id: 'TW-006',
      name: '3/8" Torque Wrench TEKTON',
      spec: '3/8"',
      calHistory: [
        { date: '2026-09-18', by: 'Igor Tolipov', result: 'PASS', certNo: 'C-77', intervalDays: 180, nextDue: '2027-03-17' },
      ],
    });

    const rows = passportRecords(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].inspector).toBe('Igor Tolipov');
    expect(rows[0].date).toBe('2026-09-18');
    expect(rows[0].result).toBe('PASS');
    // Certificate + next-due + free notes are folded into the notes column.
    expect(rows[0].notes).toContain('C-77');
    expect(rows[0].notes).toContain('2027-03-17');
  });

  it('merges wear assessments and sorts newest first', () => {
    const t = tool({
      id: 'TW-007',
      calHistory: [{ date: '2026-09-18', by: 'Igor Tolipov', result: 'PASS' }],
      audit_history: [
        { date: '2026-09-20', inspector: 'Anna', result: 'Good', wear_pct: 12, notes: 'worn grip' },
      ] as any,
    });

    const rows = passportRecords(t);
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe('2026-09-20');
    expect(rows[0].wear).toBe('12%');
    expect(rows[1].date).toBe('2026-09-18');
    expect(rows[1].wear).toBe('');
  });

  it('returns nothing for a tool with no history', () => {
    expect(passportRecords(tool({ id: 'TW-008' }))).toEqual([]);
  });
});

describe('calibration tag — the specification identifies the tool', () => {
  beforeEach(async () => {
    await freshStore();
    Store.tools = [
      tool({ id: 'TW-006', name: '3/8" Torque Wrench TEKTON', spec: '3/8"' }),
    ];
  });

  it('prints the spec on the 70×50 tag', () => {
    const html = buildLabelSheetHtml([{ id: 'TW-006', type: 'tool' }], 'calTag');
    expect(html).toContain('Spec:');
    expect(html).toContain('3/8');
  });

  it('prints the spec on the compact sheet tag too', () => {
    const html = buildLabelSheetHtml([{ id: 'TW-006', type: 'tool' }], 'calTagSheet');
    expect(html).toContain('3/8');
  });
});

describe('bin occupancy — a cell cannot be handed out twice', () => {
  beforeEach(async () => {
    await freshStore();
    Store.tools = [
      tool({ id: 'TW-001', address: { zone: '', rack: 'Rack A', shelf: 'Shelf 2', bin: 'Bin 3' } }),
      tool({ id: 'TW-002', address: { zone: '', rack: 'Rack A', shelf: 'Shelf 2', bin: 'Bin 1' } }),
    ];
  });

  it('reports occupied bins and picks the next free one', () => {
    expect(Store.getUsedBins('', 'Rack A', 'Shelf 2')).toEqual([1, 3]);
    // 1 and 3 taken → 2 is the first free cell, not 4.
    expect(Store.getNextFreeBin('', 'Rack A', 'Shelf 2')).toBe('2');
  });

  it('disables occupied cells in the option list and selects the next free one', () => {
    const { html, selected } = buildBinOptions('', 'Rack A', 'Shelf 2');
    expect(html).toMatch(/<option value="Bin 1" disabled>/);
    expect(html).toMatch(/<option value="Bin 3" disabled>/);
    expect(html).toMatch(/<option value="Bin 2">/);
    expect(selected).toBe('Bin 2');
  });

  it('preserves a manual pick of a still-free cell', () => {
    const { selected } = buildBinOptions('', 'Rack A', 'Shelf 2', 'Bin 7');
    expect(selected).toBe('Bin 7');
  });

  it('ignores the record being edited so its own bin stays free', () => {
    const { selected } = buildBinOptions('', 'Rack A', 'Shelf 2', 'Bin 3', 'TW-001');
    expect(selected).toBe('Bin 3');
    expect(isBinOccupied('', 'Rack A', 'Shelf 2', 'Bin 3', 'TW-001')).toBe(false);
    expect(isBinOccupied('', 'Rack A', 'Shelf 2', 'Bin 3')).toBe(true);
    expect(isBinOccupied('', 'Rack A', 'Shelf 2', 'Bin 2')).toBe(false);
  });

  it('treats organizer bins as available but labels them', () => {
    Store.tools.push(
      tool({ id: 'ORG-001', organizer: true, address: { zone: '', rack: 'Rack A', shelf: 'Shelf 2', bin: 'Bin 5' } })
    );
    const { html } = buildBinOptions('', 'Rack A', 'Shelf 2');
    expect(html).toMatch(/<option value="Bin 5">/);
    expect(html).not.toMatch(/<option value="Bin 5" disabled>/);
    expect(isBinOccupied('', 'Rack A', 'Shelf 2', 'Bin 5')).toBe(false);
  });
});
