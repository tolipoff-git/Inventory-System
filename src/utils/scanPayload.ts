// ============================================================================
// 5S Tool Command Center — Scan payload parser
// ============================================================================

export type ScanPayloadKind = 'tool' | 'location' | 'raw';

export interface ScanPayload {
  kind: ScanPayloadKind;
  value: string;
}

/**
 * Normalize whatever a QR/barcode scanner (or a deep link) produced into a
 * typed payload.
 *
 * Labels encode a full URL (`…/?tool=ID` or `…/?loc=LOC:…`), while a wedge
 * scanner or manual entry may produce a bare id. The monolith had this logic in
 * `Scan.found()` and the deep-link router; it was lost in the modular migration,
 * which is why scanning the app's own labels did nothing.
 */
export function parseScanPayload(text: string): ScanPayload {
  const raw = String(text || '').trim();
  if (!raw) return { kind: 'raw', value: '' };

  let toolId = '';
  let locId = '';

  // 1. Full URL — the canonical label payload.
  try {
    const url = new URL(raw);
    toolId = url.searchParams.get('tool') || url.searchParams.get('id') || '';
    locId = url.searchParams.get('loc') || url.searchParams.get('name') || '';
  } catch {
    // 2. Not a URL — accept a bare query fragment (`?tool=…` / `&loc=…`).
    const toolMatch = raw.match(/[?&](?:tool|id)=([^&]+)/i);
    const locMatch = raw.match(/[?&](?:loc|name)=([^&]+)/i);
    if (toolMatch) toolId = safeDecode(toolMatch[1]);
    if (locMatch) locId = safeDecode(locMatch[1]);
  }

  if (toolId) return { kind: 'tool', value: toolId };
  if (locId) return { kind: 'location', value: locId };

  // 3. Bare storage-location id (`LOC:…`).
  if (/^LOC:/i.test(raw)) return { kind: 'location', value: raw };

  // 4. Bare tool id (`TW-001`, `CRIMP-12`, …).
  const bare = raw.match(/\b([A-Z]{2,8}-\d{1,6})\b/);
  if (bare) return { kind: 'tool', value: bare[1] };

  return { kind: 'raw', value: raw };
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}
