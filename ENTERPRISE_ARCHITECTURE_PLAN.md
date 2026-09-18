# Enterprise Architecture & Synchronization Plan

> **Status: audited & corrected.** This document previously described a target
> architecture (WASM SQLite, PostgreSQL/Aurora, Durable Objects, CRDT, SAML SSO,
> SAP/NetSuite connectors) *and* an inaccurate "current state". The current-state
> section was wrong — it described a localStorage-only, sync-less, hardcoded-PIN
> app that no longer exists. See **§0** for the audit and **§4** for what we have
> deliberately decided *not* to build, with reasons.
>
> Live status of the app itself lives in `project_handoff.md`. This file is the
> architecture **decision record**; update it when a decision changes, not on
> every release.

---

## Table of Contents

- [0. Reality Check — Audit of This Plan](#0-reality-check--audit-of-this-plan)
- [1. System Philosophy & Operational Story](#1-system-philosophy--operational-story)
- [2. As-Built Architecture](#2-as-built-architecture)
- [3. Capability Status Matrix](#3-capability-status-matrix)
- [4. Deliberately NOT Doing (and Why)](#4-deliberately-not-doing-and-why)
- [5. Recommended Roadmap](#5-recommended-roadmap)
- [6. SOP & Standards Hub — Update Plan](#6-sop--standards-hub--update-plan)
- [7. Revisit Triggers](#7-revisit-triggers)

---

## 0. Reality Check — Audit of This Plan

The original document was written as a sales-grade target vision. It is useful as
an aspiration, but three of its claims about the *current* system were factually
wrong, which made the whole gap analysis misleading.

| Old plan claim | Actual state (audited) | Verdict |
| :--- | :--- | :--- |
| Client storage is `window.localStorage` (5 MB, string-only) | **IndexedDB** `inv_inventory_db` with 7 object stores (`tools`, `personnel`, `users`, `audit`, `procurement`, `settings`, `photos`) + photo blobs. `localStorage` holds only UI prefs (`inv_theme`, `inv_lang`, `inv_mode`, `inv_cards`) and session metadata. | ❌ claim was stale |
| Sync protocol: "Manual export/import / no cloud sync" | Cloudflare Worker `sync` API + KV, room-token auth, client `SyncManager`/`SyncApi`, **live push via ntfy SSE**, cross-tab `BroadcastChannel`. | ❌ claim was stale |
| Conflict resolution: "None / Last-Write-Wins" | `conflictResolver.ts` does **per-entity LWW by `updatedAt`** *plus* union of append-only arrays (tool `history`, `audit_history`), settings union, 5S audits union, capped audit log. | ⚠️ understated |
| Authentication: "Hardcoded PIN code check" | **PBKDF2-HMAC-SHA256** (210k iterations, salted), constant-time verify, legacy SHA-256 auto-upgrade on login, first-login PIN setup, 3 RBAC roles. | ❌ claim was stale |
| Audit & compliance: "Ephemeral browser memory log" | Persistent `audit` store (capped at `AUDIT_LOG_LIMIT`), actor + role attribution, SHA-256 fingerprint stamped on every Excel export + workbook sheet protection. | ❌ claim was stale |
| "No multi-facility isolation" | Rooms already exist (`DEFAULT_SYNC_ROOM`, `/api/sync/:roomKey`, per-room token). | ⚠️ partially done |

**Conclusion:** the "MVP limitations" narrative (§2.2 of the old document) was
obsolete. The real architecture is a **serverless, offline-first, single-tenant
PWA with opportunistic cloud sync** — not a localStorage prototype. The gap to
the described "enterprise" target is therefore *much smaller in some places and
much less desirable in others* than the old document implied.

**The one genuine architectural gap** worth naming:

> **Deletes were not tombstoned.** Removal was expressed as *absence*. A peer that
> still held an older copy would re-introduce the record on the next merge.
> Append-only data (history, audits) was safe; hard deletes (employee, registry
> entry) were not. **Closed in v112** — see §5 Phase A.

**Two deliberate non-changes** (recorded so they are not "fixed" later):

- **Tools** are already soft-deleted by `status: 'Decommissioned'` and are never
  spliced out of the array, so a separate `deletedAt` would be a second, redundant
  mechanism. Every status transition stamps `updatedAt`, so LWW already protects
  them.
- **Users** are *not* part of `SyncPayload` at all (credentials stay device-local),
  so tombstoning them would have no sync effect. They remain hard-deleted.

---

## 1. System Philosophy & Operational Story

*(Kept — this is domain content and remains valid.)*

### 1.1 Two sides of one pipeline

Inventory and procurement are not two applications; they are two stages of one
physical pipeline:

```
[ SHOP FLOOR ]                [ STORAGE ]                     [ PROCUREMENT & DOCK ]
Tool issued / part consumed → Bin hits min level            → Requisition / PO
Part put away               ← Bin replenished                ← Freight received
```

Fragmentation (spreadsheets, e-mail, paper sign-off) produces predictable
failures: stockouts nobody saw coming, duplicate orders, parcels sitting
unopened because nobody knows who requested them.

### 1.2 The closed loop, as actually implemented

| Step | In the app today | Status |
| :--- | :--- | :--- |
| 1. Consumption & deficit detection | Checkout / return / retire actions; Min/Max thresholds on consumables; low-stock surfacing in the Category Hub. | ✅ |
| 2. Aggregation & requisition | `OrderModal` cart with line items, live total, per-line reason + supplier link. | ✅ |
| 3. Purchasing & visibility | Order status pipeline; `Pending Delivery` tool status; official **REQ-003 `.xlsx`** export (cell-level template patch). Carrier/ETA tracking fields. | ⚠️ partial (no carrier ETA badge) |
| 4. Receiving & put-away | Per-line **partial receiving** and per-line **rejection with reason**; stock increments automatically; `Pending Delivery → Active`. | ✅ |
| 5. Governance & reconciliation | Audit log, SHA-256 export stamp, sheet lock, full-inventory `.xlsx`. ERP/SIEM push: **not planned** (§4). | ⚠️ by design |

### 1.3 Personas

| Persona | Goal | Journey today |
| :--- | :--- | :--- |
| Shop-floor technician | Fast checkout | Scan QR → assign/return in ≤2 taps, works fully offline |
| Kitting team lead | Line readiness, 5S | 5S radar, risk chart + risk-detail modal, maintenance queue |
| Procurement specialist | No stockouts | Orders registry, partial receiving, REQ-003 export |
| Receiving clerk | Fast intake | Scan → receive/reject per line → stock updates |
| Quality / financial auditor | Traceability | Audit log, archive, stamped exports |

### 1.4 Guiding principles (unchanged)

1. **Physical fidelity** — no phantom inventory; every record maps to a real bin/tool/PO.
2. **Zero-friction floor first** — ≤2 taps, no spinners on the critical path.
3. **Deterministic offline resilience** — Wi-Fi loss never halts work.
4. **Bi-directional visibility** — stockouts trigger procurement; receipts restock storage.

---

## 2. As-Built Architecture

### 2.1 Topology

```
+------------------------------------------------------------------+
|  CLIENT (PWA, offline-first)                                     |
|  UI (TS components, no framework) · i18n EN/RU (1:1 parity)      |
|  IndexedDB inv_inventory_db  (source of truth)                   |
|    tools · personnel · users · audit · procurement · settings ·   |
|    photos (blobs)                                                 |
|  localStorage: inv_theme, inv_lang, inv_mode, inv_cards, session  |
|  SyncManager ──> SyncApi ──> Worker      (push/pull, best-effort)|
|  LiveRelay  ──> ntfy.sh SSE             (live delta hint)        |
|  BroadcastChannel('inv_db_sync')        (cross-tab reload)       |
+----------------------------------|-------------------------------+
                                   | HTTPS (Bearer room token)
                                   v
+------------------------------------------------------------------+
|  CLOUDFLARE WORKER (src/worker/index.ts)                         |
|   • /api/sync/:roomKey   push/pull JSON snapshots                |
|   • /api/photo/:room/:id photo route (mime + 5 MiB guard, viewer)|
|   • static assets binding (Pages)                                |
|   • constant-time token compare · origin allowlist · security hdrs|
|  KV: INVENTORY_KV (primary) · EHS_KV                             |
|  Secrets: SYNC_SECRET (never in VCS) · ALLOWED_ORIGIN            |
|  Observability: Workers logs enabled (wrangler.jsonc)            |
+------------------------------------------------------------------+
```

**No** PostgreSQL, Hyperdrive, Durable Objects, or server-side ledger — see §4.

### 2.2 Sync & conflict resolution (actual)

- **Transport:** snapshot push/pull per room. The client sends its full payload;
  the Worker stores it in KV under the room key; peers pull and merge.
- **Liveness:** `ntfy.sh` SSE relay publishes a "something changed" hint; clients
  pull on hint, on local change, on interval, and manually. Failures degrade to
  polling — sync never blocks local work.
- **Merge (`conflictResolver.ts`):**
  - per-entity winner = higher `updatedAt` (remote wins ties); for personnel the
    revision time is `max(updatedAt, deletedAt)`, so a tombstone counts as an edit;
  - `history` / `audit_history` = set union (no duplicate loss);
  - `auditLog` = union, newest first, capped at `AUDIT_LOG_LIMIT`;
  - `settings` = union of workstations / programs / workposts; `wsProgram` merge;
    `audits5s` union by id (append-only);
  - `registryEvents` = newest event per key (ties → remote) — the tombstone map
    that keeps a removal from being resurrected by the union above.
- **Deletes:** personnel carry `deletedAt`; registry entries carry a
  `{t, del}` event in `settings.registryEvents`. `Store.applyLoadedData()` is the
  single funnel that applies tombstones after every load *and* every merge.
- **`updatedAt` coverage:** `Store.save()` re-stamps any tool/employee whose JSON
  changed since the last write, so a mutation path that forgot `touch()` cannot
  silently lose the edit on merge.

### 2.3 Security (actual)

- PBKDF2-HMAC-SHA256, 210k iterations, per-user salt; constant-time compare.
- RBAC: `Administrator` (3) > `Tool Crib Manager` (2) > `Operator` (1);
  privileged actions gated by `Auth.doAction(role, cb)`.
- Worker: room-token bearer + `X-Sync-Token`, constant-time compare, origin
  allowlist (`ALLOWED_ORIGIN`), photo mime allowlist + 5 MiB cap, hardened
  response headers.
- Exports: SHA-256 fingerprint + serial, logged to the audit trail; workbook
  sheets locked (unlock password = first 16 hex chars of the checksum).

### 2.4 Build, test, deploy

- Vite 6 + TS 5.6; `npm run build` → `dist/`; `bash build.sh` refreshes the SW
  cache stamp from `package.json` + git short hash.
- Quality gates: `tsc --noEmit`, ESLint, Vitest (61 tests), `npm run check:i18n`
  (EN/RU key + placeholder parity).
- Cloudflare Pages auto-deploys on push to `main`.

---

## 3. Capability Status Matrix

Legend: ✅ done · 🟡 partial · ⛔ deliberately not doing (§4) · 🔭 revisit trigger (§7)

| Capability | Status | Notes |
| :--- | :--- | :--- |
| Offline-first client storage | ✅ | IndexedDB, 7 stores + blobs |
| Serverless sync API + KV | ✅ | Worker + room tokens |
| Live cross-device push | ✅ | ntfy SSE relay (best-effort) |
| Cross-tab consistency | ✅ | `BroadcastChannel` |
| Field/entity-level merge | ✅ | LWW per entity + append-only union |
| Tombstoned deletes | ✅ | `deletedAt` (personnel) + `registryEvents` (registries), v112 |
| RBAC + hashed credentials | ✅ | PBKDF2, 3 roles |
| Audit trail + export integrity | ✅ | SHA-256 stamp, sheet lock |
| Partial receiving / rejections | ✅ | Per line item |
| Official REQ-003 export | ✅ | Cell-level template patch |
| Full inventory `.xlsx` + CSV fallback | ✅ | ExcelJS |
| Labels (A/B/C, QR/Code39) + queue | ✅ | Batch + queue printing |
| 5S audits, radar, report | ✅ | Rich report restored (v110) |
| Risk index per station/post | ✅ | Shared `computeRiskGroups()` |
| Data-driven SOP registry | ✅ | `settings.sops`, bilingual, revisions (v113) |
| Enterprise SSO (SAML/OIDC) | ⛔ | §4 |
| Postgres/Aurora + Hyperdrive | ⛔ | §4 |
| Durable Objects / bin locks | ⛔ | §4 |
| CRDT / vector clocks | ⛔ | §4 |
| Double-entry ledger / event sourcing | ⛔ | §4 |
| ERP connectors (SAP/NetSuite/Coupa) | ⛔ | §4 |
| Logpush → SIEM | ⛔ | §4 |
| WASM SQLite + OPFS | ⛔ | §4 |
| Service Worker Background Sync | 🔭 | Poor Safari support |

---

## 4. Deliberately NOT Doing (and Why)

These were the bulk of the old target architecture. Each is a **conscious
rejection**, not a missing feature. The rule of thumb: *this is a single-plant
tool crib with a handful of devices and a physically attended crib.* Complexity
must buy a real operational benefit, not a diagram.

### 4.1 WASM SQLite + OPFS
**Rejected.** IndexedDB already provides gigabytes of async structured storage
with zero build weight. WASM SQLite adds ~1 MB of binary, a Web Worker bridge,
OPFS browser quirks (Safari), and a full data-migration project — to replace a
store that is not currently a bottleneck. *Buy: nothing.*

### 4.2 Managed PostgreSQL / Aurora behind Cloudflare Hyperdrive
**Rejected for now.** It introduces a paid database, connection secrets, VPC
peering, backups, and an ops burden — for a dataset that fits comfortably in KV
(and on every client). It also creates a *second source of truth* to reconcile
against the offline-first local DB, which is precisely the complexity the current
design avoids. *Revisit only if* the data volume or a genuine multi-facility
consolidation requirement appears (§7).

### 4.3 Durable Objects + short-term bin locks
**Rejected.** Real-time lock arbitration is the right tool for *unattended*
vending or high-concurrency reservation. Here the crib is attended and checkout
is a physical handover; the failure mode the lock would prevent (two people
taking the same physical wrench) is a process issue, not a distributed-systems
one. *Cost:* a stateful coordination layer on the critical path.

### 4.4 CRDTs / vector clocks
**Rejected.** Correct for collaborative free-text editing; heavy for records with
a clear owner and a `updatedAt`. The current **per-entity LWW + append-only
union** covers the real conflicts (history/audit never lost). What we actually
need is tombstoning (§5 Phase A), which is ~50 lines, not a CRDT library.

### 4.5 Enterprise SSO (SAML 2.0 / OIDC via Cloudflare Zero Trust)
**Rejected for now.** Requires an IdP contract (Okta/Azure AD) and IT ownership
of the app's identity. The shop-floor requirement is "the right person, the right
role, no shared passwords" — already met by PBKDF2 + RBAC. *Revisit if* IT
mandates SSO or the app is onboarded to a corporate IdP.

### 4.6 Double-entry ledger / event sourcing
**Rejected.** This is financial-grade accounting for fungible goods. A tool crib
needs **traceability** (who had what, when, why retired), which the audit log +
append-only history + stamped exports already deliver. A ledger would add a
second bookkeeping system to reconcile against reality. *Note:* the *idea* worth
keeping from this is immutable, append-only event records — which the current
`history` / `audit_history` / `auditLog` already are.

### 4.7 ERP connectors (SAP S/4HANA, NetSuite, Coupa)
**Rejected.** The pragmatic integration point is the artifact the finance team
already consumes: the official **REQ-003 `.xlsx`**. Building and maintaining
connectors for systems we cannot test against is unbounded cost. *Revisit if* the
plant runs one of these and the finance team asks for a feed.

### 4.8 Cloudflare Logpush → SIEM / Datadog
**Rejected.** Workers observability/logs are already enabled in `wrangler.jsonc`.
A SIEM pipeline is enterprise security-operations tooling, out of proportion for
this deployment.

### 4.9 Microservice split / GraphQL layer
**Rejected.** One Worker, one PWA, one schema. A single deployable unit is a
feature: `bash build.sh` + push deploys everything.

### 4.10 Background Sync API (as a hard dependency)
**Deferred, not rejected.** Nice-to-have for outbox reliability, but support is
uneven (notably Safari/iOS). The current "sync on change + on hint + on interval"
is adequate and degrades gracefully.

---

## 5. Recommended Roadmap

Small, high-value increments that respect the as-built design. Each item must be
independently shippable and must not add a new runtime dependency.

### Phase A — Correctness of the sync layer ✅ *(shipped in v112)*

1. **Tombstone soft-deletes.** ✅ Personnel carry `deletedAt` (filtered out of every
   list/picker/counter via `Store.activePersonnel()`, still resolvable so tool history
   keeps real names). Registry entries — programs, stations, posts and station→program
   links — carry a `{t, del}` event in `settings.registryEvents`, merged newest-wins and
   applied in `Store.applyLoadedData()`. Tools and users were deliberately left alone
   (see §0).
2. **Audit `updatedAt` coverage.** ✅ Rather than auditing call sites by hand,
   `Store.save()` now re-stamps every tool/employee whose content changed since the
   last write (`stampDirtyRecords()`), which makes the invariant true by construction.
   `tests/registrySync.test.ts` asserts it for in-place edits, no-op saves and the
   personnel form.
3. **`/api/health`** ✅ (already present since v97) — service, timestamp, KV presence.

### Phase B — Operability *(deferred 2026-09-18 — no need yet)*

4. **Sync status panel** — last push/pull, room, peer count, pending changes; surface
   merge conflicts that lost a record (currently silent).
   - **Most of the data already exists.** `SyncManagerInstance` exposes `status`,
     `lastSyncedAt`, `room`, `deviceId`, `subscribeStatus(cb)` and
     `getStatus() → { isOnline, isSyncing, pendingChangesCount }`. The panel is a *view*
     over existing state — no new sync logic needed for the first four fields.
   - **Peer count is the one genuinely new piece.** The ntfy relay is a public broadcast
     topic with no peer registry; `SyncPing` carries a `deviceId` but pings are transient
     and `_handleRemotePing()` discards them after triggering a pull. Counting peers means
     keeping a small map of recently-seen device IDs with timestamps (and expiring them).
   - **Conflict reporting is a signature change, not a UI change.** `mergeSyncPayloads()`
     is a set of pure functions returning only the merged payload, so a lost local edit is
     invisible. Surfacing it means returning a report alongside the result (which entities
     lost, to what), which ripples into `SyncManager.triggerPull()`. Do this deliberately —
     it is the only part of the panel that touches the merge contract.
5. **Photos → R2** *(when volume grows)* — KV is not the right home for blobs at
   scale; IndexedDB stays the local cache.
   - Current path: `pushPhotoToCloud()` writes a base64 data URL as JSON to the **same**
     `/api/sync/…` route under key `photo_<ROOM>_<id>`, capped at 5 MiB
     (`MAX_PHOTO_BASE64_CHARS`) and with a **7-day KV TTL** (`expirationTtl: 604800`).
     So cloud photos already expire after a week by design; IndexedDB is the durable copy.
     Moving to R2 changes the storage backend, not the client contract.
6. **Room switcher UI** — rooms exist in the backend but are not exposed in the UI;
   needed only if more than one physical area is tracked.
   - **Switching already works in code:** `SyncManager.changeRoom()` → `setActiveSyncRoom()`
     persists `inv_sync_room` and rewrites the `?room=` URL param, and `getActiveSyncRoom()`
     reads `?room=` / `?sync=` on load — so rooms are already shareable by link. Only the
     dropdown is missing.
   - ⚠️ **The bearer token is global, not per-room** (`getSyncToken()` reads a single
     `inv_sync_token`; the Worker compares it against one `SYNC_SECRET`). Any client holding
     the token can read and write **every** room — room isolation is by key name only and is
     client-enforced. A room switcher makes that visible to users, so if rooms are ever used
     for real separation (not just separate areas), per-room tokens must come first.

### Phase C — Only on a real trigger (§7)

7. Outbound webhook on `order received` / `tool retired`.
8. ERP feed — only if finance asks and a target system exists.
9. SSO — only if IT mandates it.

---

## 6. SOP & Standards Hub — Update Plan

### 6.1 Where we were (before v113)

- `SopModal` rendered **four hardcoded SOPs** (`GEN`, `TW`, `BT`, `PB`) as English
  HTML strings inside the component.
- The Category Hub had an **SOP card** with four hardcoded buttons (`data-sop="…"`).
- Print went through `printHtml()` → the light `#printZone` form.
- The i18n key `Read SOP & Maintenance Manual` already exists (still unused as an entry point).

### 6.2 Problems

| # | Problem | Consequence | Status |
| :--- | :--- | :--- | :--- |
| 1 | Content lives in TypeScript source | The shop cannot edit standards; every wording change is a release | ✅ fixed (v113) |
| 2 | English-only | Contradicts the app's RU-first audience and its 1:1 i18n rule | ✅ fixed (v113) |
| 3 | No revision / approval metadata | Cannot claim "controlled document"; printed copies carry no revision | ✅ fixed (v113) |
| 4 | No applicability | A battery SOP shows for a torque wrench; no link from a tool to its SOP | 🟡 data model done, entry point is Phase B |
| 5 | No search, no index | Users must guess which button to press | 🔭 Phase B |
| 6 | Not auditable | Opening/printing a SOP leaves no training evidence | 🟡 saves are logged; view/print is Phase B |

### 6.3 Target design (phased)

**Data model** — SOPs live in the `settings` store as `sops: SopDocument[]`
(no new object store needed; it already syncs and merges as settings):

```ts
interface SopDocument {
  id: string;                 // 'SOP-TW-01'
  titleEn: string; titleRu: string;
  bodyEn: string;  bodyRu: string;   // safe subset of HTML
  revision: string;           // '3'
  effectiveDate: string;      // ISO date
  approvedBy: string;         // name / role
  ownerRole: 'Administrator' | 'Tool Crib Manager' | 'Operator';
  status: 'Draft' | 'Approved' | 'Obsolete';
  appliesTo: {
    toolClasses?: string[];   // ['TW','PD']
    programs?: string[];
    stations?: string[];
    posts?: string[];
  };
  updatedAt?: string;
}
```

`attachments[]` / `links[]` are deliberately **not** in the shipped model — nothing
consumes them yet, and an unused field is worse than a missing one. Add them with the
feature that reads them (Phase B/C).

**Phase A — make SOPs data, bilingual and editable** ✅ *(shipped in v113)*

1. ✅ The four existing SOPs are seeded into `settings.sops` (`src/storage/sopSeed.ts`),
   same text plus RU translations and real control metadata. Seeding only happens while
   the stored list is empty, so an edited document is never overwritten.
2. ✅ `SopModal` renders from data in the active language, with a **local EN/RU toggle**
   (so a bilingual floor can compare without switching the whole UI).
3. ✅ **"SOP & Standards" tab in System Registries** (Administrator): list, create, edit,
   *New Revision* (bump + re-date + back to Draft), mark `Approved` / `Obsolete`.
   Every change writes to the audit log (`SOP_SAVE`, `SOP_STATUS`, `SOP_REVISION`).
4. ✅ Print header with control metadata: code · revision · effective date ·
   approved by · status · applies-to, plus *"controlled document — printed copies are
   uncontrolled"* on screen and in print.
5. ✅ The Category Hub SOP card renders from `Store.approvedSops()` instead of four
   hardcoded buttons, so a new standard appears there automatically.

**Design decision — controlled documents are never deleted.** Retiring a standard means
`status: 'Obsolete'`. That is the correct document-control semantics, and it also keeps
the sync merge a plain union by id (`mergeSops()`, newest `updatedAt` wins) with no
tombstone to carry — unlike the registries in §5 Phase A.

**Phase B — surface SOPs where the work happens** *(deferred 2026-09-18 — no need yet)*

5. **Contextual entry point (do this first — cheapest, highest value).** The tool card
   (`ToolGrid.renderTools()`) has no SOP action, so a user must already know *which*
   document they need and go hunting in the Category Hub. Add a button that opens the
   standards whose `appliesTo.toolClasses` contains the tool's ID prefix (same
   `(t.id || '').split('-')[0]` pattern the reports use) — `TW-DRILL-001` → `SOP-TW-01` —
   plus any unrestricted document. This is what makes `appliesTo` earn its keep; today it
   is only printed in the document header.
   - The i18n key `Read SOP & Maintenance Manual` already exists in **both** dictionaries
     (`en.ts`, `ru.ts`) and is referenced by **no code** — a leftover from the monolith.
     Verified 2026-09-18. It is the intended label for this button; do not add a new key.
6. **SOP hub upgrade:** replace the flat list with a small index —
   grouped by area, with a search box (reuse the global search pattern), status
   badge (`Approved` / `Draft` / `Obsolete`) and "Rev. N · effective date".
   Only worth doing once the registry holds more than a handful of documents.
7. **Standards section:** a list of external references (ISO 9001 clauses,
   internal specs, supplier manuals) with `links[]`, plus optional attachments
   stored as IndexedDB blobs like tool photos.

**Phase C — evidence & governance** *(deferred 2026-09-18)*

8. **Acknowledgement log** — who read/printed which revision, for audit evidence.
   ⚠️ **Do not implement this by writing `SOP_VIEW` into the audit log.**
   `AUDIT_LOG_LIMIT` is 1000 and the log is truncated, so a record per document open
   would flood it within weeks and push out the operational entries that actually
   matter (issuance, returns, decommissioning, registry changes) — making the audit
   trail *worse*. Instead:
   - `SOP_PRINT` → the audit log (printing is rare and is the meaningful act of
     acknowledgement);
   - `SOP_VIEW` → a separate acknowledgement journal in `settings` (e.g.
     `sopAcknowledgements`), aggregated per actor × document × revision with a
     last-seen timestamp, so it never displaces operational history.
9. **Obsolete handling:** superseded SOPs remain retrievable but are visibly
   marked and excluded from contextual prompts. (Partially done: `approvedSops()`
   already excludes them from the Category Hub card.)

### 6.4 Deliberately out of scope for the SOP hub

- A full CMS / rich-text WYSIWYG (a constrained HTML subset is enough).
- E-signature workflows (approval is a recorded name + role, not a crypto signature).
- Multi-tenant SOP libraries (single plant).

---

## 7. Revisit Triggers

Each rejected item in §4 has an explicit condition that would justify revisiting
it. Until the trigger fires, the item stays rejected — do not re-open it on
"best practice" grounds alone.

| Rejected item | Revisit when… |
| :--- | :--- |
| WASM SQLite + OPFS | IndexedDB demonstrably limits us (e.g. >100k records, complex local queries). |
| Postgres + Hyperdrive | A second facility must share one authoritative dataset, **or** records exceed what KV snapshots handle comfortably. |
| Durable Objects / bin locks | Unattended vending, or a measured collision rate on concurrent checkouts. |
| CRDT / vector clocks | Concurrent editing of the same record becomes common (today it is rare and resolvable by LWW). |
| SSO (SAML/OIDC) | Corporate IT mandates an IdP, or the app is onboarded to Zero Trust. |
| Double-entry ledger | Finance requires monetary inventory valuation from this system. |
| ERP connectors | The plant runs SAP/NetSuite/Coupa **and** finance asks for a machine feed. |
| Logpush → SIEM | A security policy requires centralized log retention. |
| Room switcher UI | More than one physical area/warehouse is tracked in the same deployment. |

---

## Appendix A — Superseded aspirational notes

The previous revision of this document specified, in detail, a target state built
on WASM SQLite, PostgreSQL/Aurora + Hyperdrive, Durable Objects, CRDT/vector
clocks, SAML/OIDC, an immutable double-entry ledger, ERP webhooks and Logpush→SIEM,
delivered over a 12-week programme.

That target has been **superseded** by §4 (rejections + reasons) and §5 (the
roadmap we actually intend to run). The prior text is preserved in git history
(`ENTERPRISE_ARCHITECTURE_PLAN.md` before the audit commit) if the reasoning is
ever needed for a stakeholder conversation.

The **procurement workspace vision** from the old §12 remains a valid *product*
direction and is already largely implemented: multi-line cart, live total,
per-line partial receiving and rejection with reason, automatic stock increment,
`Pending Delivery → Active`, and the official REQ-003 export. The remaining gaps
there are cosmetic (carrier/ETA badge, vendor price history) rather than
architectural.

*End of Enterprise Architecture Specification (audited).*
