// ============================================================================
// SOP & Standards hub — controlled-document model.
//
// Standards used to be hardcoded English HTML inside `SopModal`, so the shop
// could not edit them and every wording change needed a release. They are now
// data: `settings.sops` (synced and merged like every other entity), rendered in
// the active language with revision / approval metadata.
//
// Controlled documents are **never deleted** — they are obsoleted. That is the
// correct document-control semantics and it keeps the sync merge simple: SOPs
// are unioned by id with the newest revision winning, so there is no tombstone
// to carry.
// ============================================================================

import { UserRole } from './personnel';

export type SopStatus = 'Draft' | 'Approved' | 'Obsolete';

/** Where a standard applies. Empty/absent = applies everywhere. */
export interface SopAppliesTo {
  /** `ToolClass.p` prefixes, e.g. `TW`, `PB`. */
  toolClasses?: string[];
  programs?: string[];
  stations?: string[];
  posts?: string[];
}

export interface SopDocument {
  /** Controlled document code, e.g. `SOP-TW-01`. Stable identity for sync. */
  id: string;
  titleEn: string;
  titleRu: string;
  /** Document body as HTML (paragraphs / lists), rendered as-is. */
  bodyEn: string;
  bodyRu: string;
  /** Revision label, e.g. `3` or `3.1`. */
  revision: string;
  /** ISO date (`YYYY-MM-DD`) this revision took effect. */
  effectiveDate: string;
  approvedBy: string;
  ownerRole: UserRole;
  status: SopStatus;
  appliesTo?: SopAppliesTo;
  updatedAt?: string;
}

export const SOP_STATUSES: SopStatus[] = ['Draft', 'Approved', 'Obsolete'];

/** True when the document has no applicability restrictions. */
export function appliesEverywhere(sop: SopDocument): boolean {
  const a = sop.appliesTo;
  if (!a) return true;
  return !(a.toolClasses?.length || a.programs?.length || a.stations?.length || a.posts?.length);
}

/** Human-readable applicability summary, localized. */
export function appliesToLabel(sop: SopDocument, lang: 'ENG' | 'RU'): string {
  const a = sop.appliesTo;
  if (!a || appliesEverywhere(sop)) return lang === 'RU' ? 'Везде' : 'All areas';
  const parts: string[] = [];
  if (a.toolClasses?.length) parts.push(a.toolClasses.join(', '));
  if (a.programs?.length) parts.push(a.programs.join(', '));
  if (a.stations?.length) parts.push(a.stations.join(', '));
  if (a.posts?.length) parts.push(a.posts.join(', '));
  return parts.join(' · ');
}