// ============================================================================
// Registry tombstones — soft-delete bookkeeping for the *string-array* registries
// (programs, workstations, workposts) and for station→program assignments.
//
// Those registries live in `settings` as plain arrays, and the sync merge unions
// them — so a removal on one device used to be re-introduced by any peer that
// still held the old array ("resurrected" records). Each structural change now
// records an event under a stable key:
//
//   { t: <ISO timestamp>, del: true }  → the entry was removed (tombstone)
//   { t: <ISO timestamp>, del: false } → the entry was created / renamed / moved
//
// The merge keeps the newest event per key (ties → remote), and `Store` filters
// every tombstoned key out of the arrays after loading or merging. A re-add is
// therefore expressed as a newer `del: false` event, which correctly wins.
//
// Tools do **not** need this: they are already soft-deleted by
// `status: 'Decommissioned'` and every status change stamps `updatedAt`.
// ============================================================================

export interface RegistryEvent {
  /** ISO timestamp of the structural change. */
  t: string;
  /** `true` = entry removed (tombstone); `false` = entry (re)created. */
  del: boolean;
}

export type RegistryEvents = Record<string, RegistryEvent>;

/** Stable, collision-free-enough keys for the registry entry kinds. */
export const REGISTRY_KEYS = {
  program: (name: string) => `pg:${name}`,
  workstation: (name: string) => `ws:${name}`,
  workpost: (name: string, ws: string | null | undefined) => `wp:${name}@${ws ?? ''}`,
  wsProgram: (ws: string) => `wsp:${ws}`,
} as const;

/**
 * Newest event per key wins; ties go to `remote` — the same rule the entity
 * merge uses, so two devices converge on identical state.
 */
export function mergeRegistryEvents(
  local: RegistryEvents = {},
  remote: RegistryEvents = {}
): RegistryEvents {
  const out: RegistryEvents = { ...local };
  Object.entries(remote || {}).forEach(([key, ev]) => {
    if (!ev || typeof ev !== 'object') return;
    const cur = out[key];
    if (!cur || String(ev.t || '') >= String(cur.t || '')) out[key] = ev;
  });
  return out;
}

/** True when `key` currently carries a tombstone. */
export function isTombstoned(events: RegistryEvents | undefined, key: string): boolean {
  return Boolean(events?.[key]?.del);
}
