import { TOOL_CLASSES, DAY_MS } from '../config/constants';

/** Escapes HTML characters to prevent XSS */
export function esc(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapes strings for safe inclusion in JS double-escaped attributes */
export function js(s: any): string {
  return esc(String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}

/** Date parser returning Date or null */
export function d(v: any): Date | null {
  if (!v) return null;
  const dt = new Date(v);
  return isNaN(dt.getTime()) ? null : dt;
}

/** Format Date to dd.mm.yyyy */
export function fmtDate(v: any): string {
  const dt = d(v);
  if (!dt) return 'N/A';
  return dt.toLocaleDateString('ru-RU');
}

/** ISO timestamp string */
export function nowISO(): string {
  return new Date().toISOString();
}

/** Validate and clean safe URL */
export function safeUrl(url: any): string {
  if (!url) return '';
  const clean = String(url).trim();
  return /^(https?:\/\/|\/)/i.test(clean) ? esc(clean) : '#';
}

/** Check if serial number is auto-generated */
export function isAutoSn(sn: any): boolean {
  if (!sn) return false;
  const parts = String(sn).split('-');
  if (parts.length !== 2) return false;
  if (!/^[0-9A-Z]{4,10}$/.test(parts[1])) return false;
  return parts[0] === 'SN' || TOOL_CLASSES.some(c => c.p === parts[0]);
}

/** Days until target date (negative = overdue) */
export function daysUntil(v: any): number | null {
  const dt = d(v);
  return dt ? Math.ceil((dt.getTime() - Date.now()) / DAY_MS) : null;
}

/** Format duration string: "3 days 5 hrs" */
export function durationStr(v: any): string {
  const dt = d(v);
  if (!dt) return 'N/A';
  const ms = Date.now() - dt.getTime();
  const days = Math.floor(ms / DAY_MS);
  const hrs = Math.floor((ms % DAY_MS) / 3600000);
  return `${days} days ${hrs} hrs`;
}

/** Dated file name helper: prefix_YYYY-MM-DD.ext */
export function datedName(prefix: string, ext: string): string {
  return `${prefix}_${new Date().toISOString().split('T')[0]}.${ext}`;
}
