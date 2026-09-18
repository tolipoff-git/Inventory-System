// ============================================================================
// 5S Tool Command Center — verifier picker options
// ============================================================================

import { Store } from '../storage/store';
import { Auth } from '../auth/authManager';
import { T } from '../i18n';
import { esc } from './formatters';

/**
 * Options for a "who performed this?" picker: the active personnel plus the current
 * user. The calibration tag must carry a real person ("Igor Tolipov"), not the login
 * handle ("admin"), so the picker is driven by the personnel registry.
 */
export function verifierOptionsHtml(selected?: string | null): string {
  const names = Store.activePersonnel()
    .map(e => e.name)
    .filter(Boolean);
  const user = Auth.getCurrentUser();
  const all = Array.from(new Set([
    ...names,
    ...(user && user !== 'operator' ? [user] : []),
  ]));

  const sel = (selected || '').trim();
  const head = `<option value="">${esc(T('VERIFIER_SELECT'))}</option>`;
  return head + all
    .map(n => `<option value="${esc(n)}"${n === sel ? ' selected' : ''}>${esc(n)}</option>`)
    .join('');
}

/**
 * Best default verifier: the one already recorded on the tool, else the logged-in
 * user **only if they exist in the personnel registry** (otherwise the field stays
 * empty so the operator consciously picks a person).
 */
export function defaultVerifier(recorded?: string | null): string {
  if (recorded && recorded.trim()) return recorded.trim();
  const user = Auth.getCurrentUser();
  if (!user || user === 'operator') return '';
  const match = Store.activePersonnel().find(
    e => (e.name || '').toLowerCase() === user.toLowerCase()
  );
  return match ? match.name : '';
}
