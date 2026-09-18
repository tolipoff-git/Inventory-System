// ============================================================================
// 5S Tool Command Center — storage-bin option builder
// ============================================================================
// One source of truth for every "Bin N" select (add/edit tool, transfer).
//
// The monolith (`Ops.refreshAddToolBins`) rebuilt the Bin list on every
// Rack/Shelf change: occupied bins were disabled and labelled, organizer bins
// were labelled, and the first free bin was auto-selected while a manual free
// choice was preserved. The modular migration replaced this with a dumb
// `Bin 1..50` list, so two tools could be dropped into the same cell.

import { Store } from '../../storage/store';
import { T } from '../../i18n';
import { esc } from '../../utils/formatters';

export interface BinOptions {
  /** `<option>` markup for the Bin select. */
  html: string;
  /** Value the select should end up on ('' when no storage is chosen yet). */
  selected: string;
}

/**
 * Build the Bin `<option>` list for a storage shelf.
 *
 * Occupied bins are rendered `disabled` (they cannot be picked, and browsers
 * refuse to submit them), organizer bins are marked but stay selectable.
 * The selected value is the current bin when it is still free, otherwise the
 * first free cell — exactly the monolith behaviour.
 *
 * @param excludeId id of the record being edited/transferred, so its own bin
 *                  is not counted as occupied against itself.
 */
export function buildBinOptions(
  zone: string,
  rack: string,
  shelf: string,
  current?: string | null,
  excludeId?: string
): BinOptions {
  const hasLocation = Boolean((rack || '').trim() || (shelf || '').trim());
  const used = new Set(Store.getUsedBins(zone, rack, shelf, excludeId));
  const organizers = new Set(Store.getOrganizerBins(rack, shelf, excludeId));
  const next = parseInt(Store.getNextFreeBin(zone, rack, shelf, excludeId), 10) || 1;

  const curMatch = String(current || '').match(/\d+/);
  const cur = curMatch ? parseInt(curMatch[0], 10) : null;
  const maxBin = Math.max(50, next);

  let html = hasLocation ? '' : '<option value="">- Select -</option>';
  for (let n = 1; n <= maxBin; n++) {
    const occupied = used.has(n);
    const organizer = organizers.has(n);
    const label = occupied
      ? `Bin ${n} — ${T('BIN_OCCUPIED')}`
      : organizer
        ? `Bin ${n} — 🧰 ${T('BIN_ORGANIZER')}`
        : `Bin ${n}`;
    html += `<option value="Bin ${n}"${occupied ? ' disabled' : ''}>${esc(label)}</option>`;
  }

  const selected = !hasLocation
    ? ''
    : cur && !used.has(cur) && cur <= maxBin
      ? `Bin ${cur}`
      : `Bin ${next}`;

  return { html, selected };
}

/**
 * True when `bin` is an occupied (non-organizer) cell on that shelf.
 * Defence in depth for the submit handlers: the disabled option should already
 * make this impossible, but a stale list or a scripted submit must not create a
 * duplicate address.
 */
export function isBinOccupied(
  zone: string,
  rack: string,
  shelf: string,
  bin: string,
  excludeId?: string
): boolean {
  if (!(rack || '').trim() && !(shelf || '').trim()) return false;
  const m = String(bin || '').match(/\d+/);
  if (!m) return false;
  return Store.getUsedBins(zone, rack, shelf, excludeId).includes(parseInt(m[0], 10));
}
