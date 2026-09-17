import { describe, it, expect } from 'vitest';
import { fmtDate, fmtDateTime, d } from '../src/utils/formatters';

/**
 * The app has one canonical, locale-independent date format: US `M/D/YYYY`.
 * It is used in the UI, in printed controlled documents (tool passports, 5S
 * reports) and in the Excel exports, so it must not drift with the UI language.
 *
 * Local-time strings (no trailing `Z`) are used so the assertions do not depend
 * on the machine's timezone.
 */
describe('fmtDate (canonical US format)', () => {
  it('formats as M/D/YYYY, not DD.MM.YYYY', () => {
    // Day 17 > 12 makes the field order unambiguous.
    expect(fmtDate('2026-09-17T12:00:00')).toBe('9/17/2026');
  });

  it('does not zero-pad month or day', () => {
    expect(fmtDate('2026-01-05T12:00:00')).toBe('1/5/2026');
  });

  it('accepts Date objects and ISO strings alike', () => {
    expect(fmtDate(new Date('2026-09-17T12:00:00'))).toBe('9/17/2026');
    expect(fmtDate('2026-09-17T12:00:00.000Z')).toMatch(/^\d{1,2}\/\d{1,2}\/2026$/);
  });

  it('returns N/A for missing or unparseable input', () => {
    expect(fmtDate(null)).toBe('N/A');
    expect(fmtDate(undefined)).toBe('N/A');
    expect(fmtDate('')).toBe('N/A');
    expect(fmtDate('not-a-date')).toBe('N/A');
  });
});

describe('fmtDateTime (canonical US format)', () => {
  it('formats as M/D/YYYY with a 12-hour clock', () => {
    const out = fmtDateTime('2026-09-17T14:05:00');
    expect(out).toMatch(/^9\/17\/2026, 2:05:00 PM$/);
  });

  it('returns N/A for missing or unparseable input', () => {
    expect(fmtDateTime(null)).toBe('N/A');
    expect(fmtDateTime('nope')).toBe('N/A');
  });
});

describe('d (date parser)', () => {
  it('returns null for falsy or invalid values', () => {
    expect(d(null)).toBeNull();
    expect(d('')).toBeNull();
    expect(d('garbage')).toBeNull();
  });

  it('returns a Date for valid values', () => {
    expect(d('2026-09-17T12:00:00')).toBeInstanceOf(Date);
  });
});