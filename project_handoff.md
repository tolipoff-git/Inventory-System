# Project Handoff: 5S Tool Command Center v3

## Overview
- **Repository:** `/home/admin/git/Inventory-System`
- **Current Version:** `v118` (single source: `package.json` `version`, substituted at build time into `CONFIG.APP_VERSION`; `build.sh` reads the same value for the SW cache stamp)
- **Architecture:** Modular TypeScript PWA (Vite 6 + TS 5.6). Entry `src/main.ts` → `src/ui/app.ts`. The legacy 12k-line single-file monolith is preserved as `index.monolith.v97.html` for reference only and is **not** the active app.
- **Storage:** **IndexedDB (`inv_inventory_db`) unified storage** for all application state across 7 object stores (`tools`, `personnel`, `users`, `audit`, `procurement`, `settings`, `photos`). `localStorage` is strictly isolated for lightweight UI preferences (`inv_theme`, `inv_lang`, `inv_mode`, `inv_cards`) and session metadata (`currentUser`).
- **Platform:** Cloudflare Pages (auto-deploy on push to `main`, using `bash build.sh` build command).

## Session Continuity — Resume Point (2026-09-18, v118)

**Read this block first after a context compaction.** It is the live state of the current
working session; the per-release history below is the long-term record.

### State
- **Version:** `v118` (`package.json` = 118.0.0). `sw.js` `CACHE_VERSION` = `v118-<hash>`.
- **Branch:** `main`, in sync with `origin/main`; working tree clean. `git log --oneline -5` is the authoritative tail.
- **Gates (all green at v118):** `npm run typecheck` · `npm run lint` · `npm test` (101/101) ·
  `npm run build` · `npm run check:i18n` (694/694). `tsconfig.json` includes `tests`,
  so `typecheck` and `build` cover the test suite too — keep it that way.
- **Deploy:** push to `main` → Cloudflare Pages auto-deploy. Release workflow is defined in
  `AGENTS.md` (bump version → README + handoff → `bash build.sh` → feature commit →
  `chore(pwa): refresh sw.js …` commit → push) — **run it without asking**.

### Shared modules introduced this session — single sources of truth, reuse them
- `src/reports/s5Scores.ts` → `compute5SPillars()` — 5S pillar scores; used by the dashboard
  radar (`ChartsView.compute5S()` is now a thin mapper) **and** the 5S report.
- `src/reports/riskIndex.ts` → `computeRiskGroups()` — station|post risk index; used by the
  risk radar, the risk-detail modal and the report.
- `src/reports/kaizen.ts` → `analyzeKaizen()` + `renderKaizenScreen/Print()` — role-targeted advice.
- `src/reports/s5Report.ts` → `retireStats()`, `procurementDetail()`, `buildS5Report()`,
  `renderS5ReportScreen()`, `renderS5ReportPrint()`.
- `src/utils/pwa.ts` → `hardReloadPwa()` — real hard update (clear caches + unregister SW + `?t=` reload).
- `src/i18n/faqContent.ts` → `FAQ_BODY_EN` / `FAQ_BODY_RU` (imported by both dictionaries).
- `src/ui/components/Modals/RiskModal.ts` — risk-detail drill-down opened from the risk radar.
- `src/types/registry.ts` → `REGISTRY_KEYS`, `mergeRegistryEvents()`, `isTombstoned()` — the
  registry tombstone model (v112). `Store.applyRegistryTombstones()` is the only place they
  are applied; `Store.activePersonnel()` is the only way to read live personnel.
- `src/types/sop.ts` + `src/storage/sopSeed.ts` → the controlled-document model and the four
  seeded standards (v113). `Store.sops` / `Store.approvedSops()` / `Store.getSop()` are the
  only ways to read them; `SopModal` and the Category Hub SOP card both render from data.
- `Store.importRegistryFromData()` / `Store.pendingRegistryImport()` (v114) — rebuild the
  registry from data that already references it. `pendingRegistryImport()` is the read-only
  plan used by the integrity report; keep the two in sync via `collectRegistryImport()`.
- `src/utils/scanPayload.ts` → `parseScanPayload()` (v115) — the only place a scanned/deep-linked
  string is normalized to `{kind: 'tool'|'location'|'raw', value}`. Used by `AppUI.handleScanResult`
  and the deep-link router; `ScannerModal` routes its no-callback path through `window.handleScanResult`.
- `src/ui/components/Modals/CalibrationModal.ts` (v115) — single-tool and session verification UI.
  Writes through `recordCalibration()` / `recordCalibrationBatch()` in `toolOps`.
- `calDueFrom(date, intervalDays)` + `recordCalibration()` / `recordCalibrationBatch()` (v115) in
  `src/operations/toolOps.ts` — the only place verification is recorded; `completeMaintenance()`
  delegates the same structured fields. Labels read `tool.calVerifiedBy/At`, `calDue`, `calCertNo`.
- `scripts/check-i18n-parity.mjs` → `npm run check:i18n` — the EN/RU parity gate.

### Next actions (agreed direction, not yet started)
1. **SOP hub — Phase B** (plan §6). **Deferred by the user on 2026-09-18 — no need right now.**
   Recorded in the plan with the design notes, so it is not lost:
   - *Contextual entry point first* (cheapest, highest value): a tool-card button that opens
     the standards matching the tool's ID prefix via `appliesTo.toolClasses`. The label key
     `Read SOP & Maintenance Manual` already exists in both dictionaries and is used by **no
     code** — it is the intended label, do not add a new key.
   - *Index + search in the hub* — only worth it once the registry holds more than a handful
     of documents.
   - *Acknowledgement log* — ⚠️ do **not** write `SOP_VIEW` into the audit log: `AUDIT_LOG_LIMIT`
     is 1000 and truncates, so a record per open would flood it and push out the operational
     entries that matter. Use `SOP_PRINT` → audit log, `SOP_VIEW` → a separate aggregated
     journal in `settings`.
2. **Sync Phase B** (plan §5). **Deferred by the user on 2026-09-18 — no need right now.**
   Recorded in the plan with the design notes:
   - *Status panel* — `SyncManagerInstance` already exposes `status`, `lastSyncedAt`, `room`,
     `deviceId`, `subscribeStatus()` and `getStatus()`, so it is mostly a view. Peer count is
     the only genuinely new state (ntfy is a public broadcast with no peer registry).
     Conflict reporting is a **signature change** to `mergeSyncPayloads()`, not a UI change —
     do it deliberately.
   - *Photos → R2* — today photos are base64 JSON on the same `/api/sync/…` route, 5 MiB cap,
     **7-day KV TTL**; IndexedDB is the durable copy.
   - *Room switcher* — `changeRoom()` already works and rooms are shareable via `?room=`; only
     the dropdown is missing. ⚠️ The bearer token is **global, not per-room**, so room
     isolation is client-enforced by key name only — per-room tokens must come first if rooms
     are ever used for real separation.
   Phase A (tombstones, `updatedAt` coverage, `/api/health`) shipped in v112.

### Decisions & assumptions to preserve
- Report/Kaizen prose is deliberately kept as **inline `{en, ru}` pairs** inside the report
  modules (monolith parity-by-construction) — **not** in the dictionaries. Dictionary key sets
  stay untouched (parity 622/622). Do not "fix" this by moving the prose into i18n.
- `Tool.maxQty?: number` was added to `types/inventory.ts` (Min/Max consumable thresholds).
- `applyLanguage()` now removes **closed** `.modal-overlay` nodes so modals rebuild in the new
  language on next open; static labels use `data-i18n` (chart titles, KPI labels, hints).
- Risk radar labels truncate the **name** first, then append the ★/▼ mark (the mark used to be
  cut off by truncation).
- `compute5SPillars()` / `computeRiskGroups()` are the only places 5S/risk scores are computed —
  never re-implement them in a view.
- **Deletes are tombstones, never absence** (v112). Tools use `status: 'Decommissioned'`;
  personnel use `deletedAt`; registries use `settings.registryEvents`. Never `splice()` a
  synced record out of its array — and never read `Store.personnel` directly in a view, use
  `Store.activePersonnel()`.
- **The Risk Index chart is tool-derived, not registry-derived** (v114). It groups
  `Store.activeTools()` by `workstationAndPostOf()`, which for an issued tool prefers the
  **holder's** station. A station with no tools has no ray — that is intentional and matches
  the monolith. Do not "fix" it by adding empty registry stations to the chart.
- **Never relocate data to repair a reference.** The integrity check's old auto-fix moved
  tools to the first registered station and destroyed their real location. The correct repair
  is to register what the data already references (`importRegistryFromData()`).
- **Controlled documents are never deleted** (v113). Retiring a standard means
  `status: 'Obsolete'`; that is why `mergeSops()` needs no tombstone. Standards live in
  `settings.sops` and are seeded only while the stored list is empty, so an edited document
  is never overwritten by `SEED_SOPS`.
- `Store.save()` is the sync clock: it stamps `updatedAt` on anything that changed. Do not
  bypass it with a direct `AppDB.saveAll()`.
- **Tests must install a fresh `IDBFactory` per test** (`globalThis.indexedDB = new IDBFactory()`
  inside `freshStore()`), otherwise `fake-indexeddb` keeps one `inv_inventory_db` for the whole
  file and `Store.init()` reloads the previous test's state.

### Do NOT re-open (conscious rejections — plan §4; revisit triggers in §7)
WASM SQLite/OPFS · Postgres/Aurora + Hyperdrive · Durable Objects / bin locks · CRDT / vector
clocks · SAML/OIDC SSO · double-entry ledger · ERP connectors (SAP/NetSuite/Coupa) ·
Logpush→SIEM · microservice/GraphQL split. Also do not re-open the deferred rendering
refactors (WeakMap DOM cache, lit-html, list virtualization) — see "Deferred Audit Items" below.

### User context
- Russian-speaking, RU-first UI. Expects the 5S report and dashboard charts to be **rich**
  (monolith-level), not minimal.
- Prefers pragmatic, shippable increments over enterprise patterns; dislikes over-engineering.
- Standing instruction: perform the full release flow (bump → docs → `build.sh` → commits → push)
  automatically, without asking.

## Recent Accomplishments (v49 – v118)

### 0. Label Print Fix (QR sizing) + Add-Tool Form Restored (v118 Release)
- **Root cause of "the tag prints as a fragment":** the `qrcode` renderer sets
  `canvas.style.width/height` in **pixels** (`renderer/canvas.js`), clobbering the mm-based
  sizing the label layouts rely on — a 19mm QR became ~79mm and was clipped by the cell.
  The monolith used QRious, which does not touch the style. Fix: `renderQrToCanvas()` now
  captures the element's inline style and restores it after render (the pixel buffer stays
  high-res at 300px; display size stays whatever the layout dictates). Applies to every
  label format. Also: no `page-break-after` on the **last** single/roll label (was a
  trailing blank page in the PDF).
- **Add-tool form restored to monolith parity:** **Type** (Permanent/Consumable) + **Tool
  Class** pickers; the class auto-fills the inventory number (`suggestToolId`) and the
  default category; a blank Serial Number is auto-generated as `CLASS-XXXXXXXX` (which
  `isAutoSn()` recognises); **Calibration Interval (days)** added to add + edit and rolls
  `calDue` forward. Labels: the header 🏷 now opens **Print Queue**, which lets you choose the
  stock (Avery 5161/5163/5366, Brady, Generic A/B/C, Calibration Tag) and start cell.
- `tests/labels.test.ts` +3 tests (calTag block, no trailing page-break, single-stock layout).

### 0. FAQ: Calibration & Verification Section (v117 Release)
- Added a dedicated FAQ section **“Calibration & verification”** (EN/RU) covering the
  per-tool record, the batch **Calibration Session**, printing the **Calibration Tag**, and
  the verification fields captured by *Complete Maintenance*.
- Section 2 gained the **⚗ Record Calibration** action; section 4 gained the phone-camera
  QR deep-link and the calibration-tag media; the troubleshooting section gained the
  “due date never changes → set an interval” entry. Sections renumbered 1–10 in both languages.

### 0. Calibration Queue Integration (v116 Release)
- The **Maintenance & Calibration Queue** hub card (existing since the monolith) is now the
  entry point for verification: added a **⚗ Calibration Session** button beside
  *Open Service Queue*, and made the due/overdue rows clickable to open the tool card.
- The queue's `maintq` filter already counted `Maintenance` / `Overdue` / calibration due
  ≤ `CAL_WARNING_DAYS`; it now reflects the interval-derived `calDue` written by
  `recordCalibration()`. No change to the filter logic itself.

### 0. Calibration & Verification Workflow + QR Round-Trip (v115 Release)
- **QR round-trip restored.** Labels encode `…/?tool=ID` / `…/?loc=LOC:…`, but the modular app
  had neither a deep-link router on load nor URL parsing in the scanner — so scanning the app's
  own labels did nothing. Added `parseScanPayload()` (`src/utils/scanPayload.ts`), a deep-link
  router in `AppUI.init()` (opens the tool card / storage filter, then cleans the URL), and made
  `ScannerModal`'s no-callback path use the shared handler. Handles full URLs, `?id=`/`?name=`
  aliases, bare `LOC:` ids and bare tool ids.
- **Structured verification record** on `Tool`: `calVerifiedAt`, `calVerifiedBy`, `calIntervalDays`,
  `calCertNo`, `calHistory[]`. `recordCalibration()` / `recordCalibrationBatch()` in `toolOps`
  are the single writers; `completeMaintenance()` takes an optional `CalibrationInput`.
  Next due = `date + interval`.
- **`CalibrationModal`** — *Record Calibration* on the tool card / grid (works on an `Active`
  tool, unlike *Complete Maintenance*), plus a **Calibration Session** (*Operations & Reports*)
  that stamps a whole shelf in one go and prints a run of tags.
- **Calibration tag** (`calTag`, 70×50 mm) prints the verification block (who · when · valid until ·
  certificate #) beside the QR; the tool card shows the block and the last five events.
- `ServiceModal` now captures who verified, when, the interval and the certificate when closing
  maintenance. Added `calibration.test.ts` (13 tests).
The application has undergone massive functional and architectural expansion. The current agent should be aware of the following new subsystems and fixes:

### 0. Registry Import from Existing Data & Non-Destructive Integrity Repair (v114 Release)
- **Symptom (reported):** the Risk Index chart showed some programs but not all; stations/programs added by hand in the registry never appeared there; old stations from the monolith (e.g. `ITPS | VRC`) were visible in the chart but missing from the registry, and people were assigned to them.
- **Root cause — two separate things:**
  1. **The chart is tool-derived, not registry-derived.** `computeRiskGroups()` (`src/reports/riskIndex.ts`) groups `Store.activeTools()` by `workstationAndPostOf(tool)`, and `toolOps.workstationAndPostOf()` prefers the **holder's** station for issued tools. A station with no tools has no risk to show, so it never gets a ray. This matches the monolith exactly (`Charts.computeCulture()` did the same) — no change was needed, only an explanation (now in the FAQ).
  2. **The registry was missing structure that already existed in the data.** Tools and personnel carry station/post/program as free text (that is how the monolith stored them), so a station can be in daily use long before it is registered.
- **New — `Store.importRegistryFromData()`:** rebuilds the registry from the data that already references it, **without touching a single tool or person**. Sources in order of trust: `personnel.ws`/`post` (plus legacy `workstation`/`defaultWs`/`defaultPost`), `tool.address.zone`, and `tool.location` written as `station / post`. Also creates the programs declared on tools and links each station to its program. Idempotent, snapshot-backed (undoable via *Rollback Last Cascade*), logged as `REGISTRY_IMPORT`.
  - **Bare free-text locations are deliberately NOT registered.** `Shadow Board`, `Tool Crib`, `Calibration Lab` are storage areas, not stations — registering them is what produced the “huge list of shelves” in the workstation chart. They are reported back in `skipped` so the user can add a real station by hand if one is genuinely missing.
  - `Store.pendingRegistryImport()` returns the same plan without mutating anything, so the integrity report and the repair always agree on what counts as missing.
- **Fixed a data-loss bug in the Integrity Check.** Its “Auto-Fix All Issues” used to **relocate** every tool whose station was not registered to the first registered station (`Tool Gage`), silently destroying the real location — and it was the only offered repair for exactly the anomaly the user was hitting. Now:
  - primary action is **📥 Register missing stations & posts** (non-destructive, the correct repair);
  - the relocation survives as **🛠 Move tools to default station**, explicitly labelled and behind a confirmation that says it overwrites locations;
  - the diagnostic now also reports unregistered stations referenced by **personnel**, and its previously hardcoded English strings are localized.
- **UI:** the import button is in *System Registries* → **Programs & Stations** (where you look for stations) and in the Integrity Check (where the anomaly is reported).
- **FAQ:** the troubleshooting entry no longer tells users to press the destructive “Fix”; both EN and RU now describe the non-destructive repair, and a new note explains why a hand-added station does not appear in the Risk Index chart.
- **Tests:** `tests/registryImport.test.ts` (13 cases) — personnel/tool/address-zone sources, storage areas skipped, program creation + linking, non-destructiveness, idempotency, tombstoned personnel ignored, legacy fields, `pendingRegistryImport()` purity, rollback, audit logging, and that imported entries are marked alive so a stale tombstone cannot prune them. Suite: 73 → 86.
- **Test isolation fix:** `fake-indexeddb` keeps the same `inv_inventory_db` across tests in a file, so `Store.init()` was reloading the previous test's persisted state. `registrySync.test.ts` and `registryImport.test.ts` now install a fresh `IDBFactory` per test.

### 0. SOP & Standards Hub — Data-Driven Controlled Documents (v113 Release)
- **Symptom:** the four standards (`SOP-GEN-00`, `SOP-TW-01`, `SOP-BT-02`, `SOP-PB-03`) were hardcoded **English HTML strings** inside `SopModal.renderSopContent()`. The shop could not edit them, every wording change needed a release, and the RU-first audience got English documents.
- **Model** — new `src/types/sop.ts`: `SopDocument { id, titleEn/Ru, bodyEn/Ru, revision, effectiveDate, approvedBy, ownerRole, status, appliesTo{toolClasses,programs,stations,posts}, updatedAt }`, `SopStatus = Draft | Approved | Obsolete`, plus `appliesEverywhere()` / `appliesToLabel()`.
- **Storage** — `settings.sops` (no new object store: `settings` already syncs and merges). `src/storage/sopSeed.ts` holds the four legacy documents, now **bilingual** with real control metadata. Seeding happens only while the stored list is empty, so an edited or obsoleted document is never overwritten by the seed.
- **Lifecycle** — `Store.saveSop()` (upsert + `SOP_SAVE`), `Store.setSopStatus()` (`SOP_STATUS`), `Store.newSopRevision()` (bumps the label, re-dates to today, returns to Draft, `SOP_REVISION`), `Store.approvedSops()`, `Store.getSop()`. **Controlled documents are never deleted** — retiring one means `status: 'Obsolete'`. That is the correct document-control semantics *and* it keeps the merge simple: `mergeSops()` is a plain union by id with the newest `updatedAt` winning, so no tombstone is needed (contrast with v112).
- **Rendering** — `SopModal` now renders the stored document in the active language with a control header (code · revision · effective date · approved by · status · applies-to), a **local EN/RU toggle** in the footer (reads the other language without switching the whole UI) and a "controlled document — printed copies are uncontrolled" footer that also appears in print. The Category Hub SOP card is rendered from `Store.approvedSops()` instead of four hardcoded buttons, so a new standard appears there automatically.
- **Registry tab** — new **SOP & Standards** tab in `RegistryModal` (Administrator, like the rest of the modal): table of documents with status colouring, plus an edit modal for code / revision / date / approver / owner role / status / both titles / both bodies / applicability (comma-separated scopes). Actions: edit, new revision, mark obsolete.
- **i18n:** 36 new keys in both dictionaries (658/658). The parity gate immediately caught one real slip — `SOP_SHOW_RU` had been given a Russian value in the *English* dictionary; the toggle now reads "Show in Russian" / "Показать по-английски" depending on the current view language.
- **Tests:** `tests/sop.test.ts` (12 cases) — seeding, bilingual/control-metadata invariants, seed-not-overwriting-an-edit, upsert + `updatedAt`, revision bump, obsolete lifecycle, audit logging, merge rules (union, newest wins, ties → remote, stale peer cannot roll a revision back) and applicability labels. Suite: 61 → 73.

### 0. Tombstoned Deletes & Guaranteed `updatedAt` (v112 Release)
- **Symptom:** a record deleted on one device came back after the next sync — the merge expressed removal as *absence*, so any peer still holding the old copy re-introduced it. This was the one genuine architectural gap named in `ENTERPRISE_ARCHITECTURE_PLAN.md` §0.
- **Personnel — `deletedAt` soft delete:** `Employee.deletedAt` + `Store.removePersonnel(id)` (tombstone + `EMP_REMOVE` audit entry). The record stays in `personnel` so tool assignments and history keep resolving real names, but `Store.activePersonnel()` is now used by every list, picker and counter (registry table, checkout assignee select, staff hub, personnel XLSX sheet, Kaizen care advice, REQ003 requestor lookup, `zoneUsage`). `mergePersonnel()` compares `max(updatedAt, deletedAt)`, so a tombstone counts as an edit and a peer's stale live copy cannot undo it.
- **Registries — `settings.registryEvents`:** programs, stations, posts and station→program links are plain string arrays merged by *union*, so a deletion could never propagate. Each structural change now records `{ t, del }` under a stable key (`src/types/registry.ts` → `REGISTRY_KEYS`); `mergeRegistryEvents()` keeps the newest event per key (ties → remote) and `Store.applyRegistryTombstones()` filters dead entries out. `Store.applyLoadedData()` is the single funnel that applies them after **both** the IndexedDB load and the sync merge, so a peer's stale array cannot resurrect anything. Renames retire the old keys (a station rename also retires its posts' keys, which embed the station name); a re-add is a newer `del: false` event and correctly wins.
- **`updatedAt` coverage by construction:** instead of auditing call sites by hand, `Store.save()` calls `stampDirtyRecords()`, which re-stamps any tool/employee whose JSON changed since the last write. A mutation path that forgot `touch()` can no longer silently lose the edit on merge. `refreshPersistedFingerprints()` re-baselines after every load/merge/save, so normalization (`migrate()`, `recomputeStatuses()`) and applied remote data never make this device look newer than its peers.
- **Deliberate non-changes:** tools already soft-delete via `status: 'Decommissioned'` (never spliced out, every transition stamps `updatedAt`) — a second `deletedAt` would be redundant. `users` are not part of `SyncPayload` at all (credentials stay device-local), so tombstoning them would have no sync effect.
- **Monolith parity restored:** the employee-removal guard (`EMP_REMOVE_BLOCKED` — a holder must return their tools first) and the localized `EMP_REMOVE_CONFIRM` existed as dictionary keys but were unused by the modular `RegistryModal`; both are wired up again. Added `USER_REMOVE_CONFIRM` (EN/RU) for the RBAC tab.
- **New gate:** `npm run check:i18n` (`scripts/check-i18n-parity.mjs`) — mechanical EN/RU parity: equal key sets, identical `{placeholder}` sets per key, no Cyrillic left in the English dictionary. 622 keys each.
- **Tests:** `tests/registrySync.test.ts` (13 cases) — tombstone merge rules, registry prune on load/merge, re-add wins over an older tombstone, station-rename key retirement, personnel soft delete round-trip through IndexedDB, and `updatedAt` stamping. Suite: 48 → 61.
- **Test suite is now typechecked:** `tsconfig.json` `include` gained `tests`, which surfaced two latent errors that `npm run typecheck` had been silently skipping — a duplicate `id: on.id` before `...on` in `tests/conflictResolver.test.ts`, and a synchronous `ASSETS.fetch` stub in `tests/worker.test.ts` that did not satisfy `WorkerFetcher` (`Promise<Response>`). Both fixed; `npm run build` now typechecks the tests as well.

### 0. Language Switch Re-translates Charts, KPIs & Modals (v111 Release)
- **Symptom:** in ENG mode the dashboard chart card titles (and the KPI labels) stayed Russian.
- **Root cause:** `ChartsView.render()` and `MetricsBar.render()` build their labels once at mount; `refreshAll()` (fired by `onLanguageChange`) only calls `charts.update()` / `metrics.update()`, which repaint the SVG and the numbers but **not** the labels. Modals had the same class of bug — their DOM is created on first open and cached, so a modal opened before the switch kept the old language.
- **Fix:**
  - Added `data-i18n` to the four chart card titles, `CULTURE_LEGEND`, `RADAR_CLICK_HINT` and the five KPI labels/hints. `applyLanguage()` already translates every `[data-i18n]` element on each switch, so no render-path change was needed.
  - `applyLanguage()` now removes **closed** `.modal-overlay` nodes, so the next open rebuilds them in the current language. An open modal is left untouched. Every modal already follows the `if (!modal) createModalDOM()` pattern, so removal is safe.

### 0. 5S Report Restored to Monolith Depth (v110 Release)
- **Symptom:** the modular 5S report was a thin subset of the monolith's — it had lost decommissioning statistics, procurement detail/recommendations, Kaizen advice by role, the workstation culture table, per-pillar rubric findings and the print signature block.
- **Content restored** — new `src/reports/s5Report.ts` + `src/reports/kaizen.ts`:
  - **Decommissioning Statistics & Dynamics** — total retired, most frequent reason, per-category counts, recently decommissioned list. `retireStats()` parses both `history` (`"<ts> | Decommissioned on … (Reason: X, Wear: N%, Insp: Y)"`) and `audit_history` (`"Decommissioned: …"` notes), plus the legacy `retireReason` field.
  - **Procurement Recommendations + Procurement Detail** table — per position: last receipt (from `history` `"Received order …"`), consumption basis (from `procurementLog` items), needed qty (low-stock consumables topped up to `maxQty`; retired positions grouped by name).
  - **Kaizen Recommendations** — port of the monolith's role-targeted advice module (priority 1 *act now* / 2 *plan* / 3 *sustain*, addressed to Administrator / Tool Crib Manager / Operator), with screen and print variants.
  - **Workstation Production Culture** table (station|post, score/100) and **5S Pillars Assessment** with rubric findings.
  - The modal's **Print** button now renders the light `#printZone` document (KPIs, all tables, Kaizen, signature lines) instead of dumping the dark modal HTML.
- **Optimisation — shared computation, no duplication:**
  - New `src/reports/s5Scores.ts` (`compute5SPillars()`) is the single source of truth for the 5S pillar scores used by BOTH the dashboard radar and the report; `ChartsView.compute5S()` is now a thin mapper (previously the logic lived privately in `ChartsView`, so the report could not reuse it).
  - The report reuses `computeRiskGroups()` (`riskIndex.ts`), so the document and the risk chart always agree; Kaizen advice reuses `careOf()` and the same risk groups.
- **i18n:** report/Kaizen prose is kept as inline `{en, ru}` pairs (exactly as the monolith's `Kaizen` module did), so every label exists in both languages by construction; the dictionary key sets are untouched (parity 622/622).
- **Type:** added `Tool.maxQty?: number` (Min/Max consumable thresholds were previously only reachable through `any`).

### 0. Risk Radar Best/Worst Markers Visible (v109 Release)
- **Symptom:** the "Risk Index & Incidents" radar showed no ★ best / ▼ worst markers on the rays.
- **Root cause:** `renderRadarSvg()` (ported from the monolith, which had the same latent bug) built the label as `pillar + ' ' + mark` and **then** truncated it to 14 chars — so on any station|post name longer than ~12 chars the mark was cut off and never rendered. Node fill colour was still correct, but the glyph was gone.
- **Fix:** truncate the **name** first, then append the mark, so ★/▼ always survives. The hover tooltip already carries the ★/▼ driver prefix, and the node/label colour marks best (green) / worst (red) as before.

### 0. Chart Interactivity, Personnel Field Resolution & FAQ Rewrite (v108 Release)
Fixed regressions in the v107 chart work and rewrote the FAQ.
- **Risk chart showed a single ray:** `computeRiskGroups()` (added in v107) folded every tool whose station was not in `Store.workstations` into one `Storage / Crib` bucket. Root cause: personnel migrated from the monolith store `workstation`/`defaultWs`/`defaultPost`, **not** `ws`/`post`, so `workstationAndPostOf()` resolved every assigned tool to `Unassigned` → one bucket. Fixes: (a) `Store.migrate()` normalizes personnel `ws`/`post` from the legacy fields; (b) `toolOps.workstationAndPostOf()` falls back to them; (c) `computeRiskGroups()` groups by `station | post` again and only buckets tools with **no** resolvable station. Result: one ray per real station/post again.
- **Status donut “Backup” click did nothing:** the donut folds unknown statuses (`Pending Delivery`, `Calibration`) into `Backup`, but the filter matched `t.status === 'Backup'`. New shared `statusBucket()` in `toolOps` is now used by both `ChartsView.renderStatusChart()` and `app.filterAndRenderGrid()`, so a slice click always shows exactly the tools that were counted.
- **5S audit radar ray was not interactive:** only the small node circle carried hover/click handlers. `renderRadarSvg()` now binds hover/click to the **spoke** (via a transparent 14px hit line) and the axis label as well; background rings and the score polygon are `pointer-events: none`. Whole-ray interaction now works for the 5S radar *and* the risk radar.
- **Real 1-click PWA hard update:** the version badge, `🔄 Update PWA` (Ops menu) and `Force Update App` (System menu) previously only called `window.location.reload()`. They now call `hardReloadPwa()` (`src/utils/pwa.ts`): clear Cache Storage → unregister service workers → reload with a `?t=` cache-buster, with a 2.5 s safety timeout so it can never hang. Mirrors the monolith `hardReload`.
- **FAQ rewritten (EN/RU):** content moved to `src/i18n/faqContent.ts` (`FAQ_BODY_EN` / `FAQ_BODY_RU`, imported by both dictionaries so the key-parity invariant holds). Rewritten as a task-oriented guide — quick start, tool actions, structure, storage/labels, procurement, dashboard/risk, 5S audits, update/offline/data, troubleshooting. Version references are generic (`v***`) instead of the stale hard-coded `v97`; internal code identifiers (`Ops.receiveOrderItem`, `getNextFreeBin()`) removed. `initFaqAccordion()` now scopes to `.faq-accordion details` (works in the modal) and the FAQ modal re-renders on language change (`applyLanguage` handles `#faqModalBody`).
- Note: the “Workstation Tool Load” chart showing many shelf rows was caused by dangling tool locations and is resolved by the user running the Integrity **auto-fix** — no code change.

### 0. Registry Hierarchy, Personnel Assignment & Risk Detail (v107 Release)
Restored monolith registry/chart behaviour that the modular rewrite had dropped, and added a risk-detail drill-down.
- **Programs & Stations tab rebuilt** (`RegistryModal.renderWs`) to the monolith `renderRegistryLists` shape: **Program → Station → Post** hierarchy with an inline **“+ Add” post row under every station** (posts previously could not be created at all), an inline add-station row per program, a **“No program (areas)”** bottom group (this is where `Tool Gage` / `Machine Shop` now appear — they were previously invisible), and a **“No zone (unassigned)”** group for `ws === null` posts.
- **Unlink / move:** station **⇄ “Move to program…”** (with a **“— No program —”** option to detach a station from its program) and post **⇄ “Move to zone…”**, both with full cascade. New `Store` methods: `programExists`, `addWorkstation`, `addWorkpost`, `renameWorkstation`, `renameWorkpost`, `moveWorkpost`, `removeWorkstation`, `removeWorkpost`, `zoneUsage`. The reg-edit modal now has three modes (`rename` / `move-ws` / `move-wp`).
- **Personnel → Program/Station/Post assignment:** the personnel form gained a **Program** selector that filters the station dropdown (Program → Station → Post); the table gained a **Program** column. Removed the implicit `emp.ws || 'Tool Gage'` default that silently pinned employees to Tool Gage.
- **Risk Index chart** (`src/reports/riskIndex.ts`, new): shared `computeRiskGroups()` groups active tools by **station | post** with a 0–100 index; tools outside the registry are aggregated into a single **“Storage / Crib”** bucket so the chart no longer spawns a point per free-text location. `ChartsView.computeCulture()` now consumes it and shows the index in the hover tooltip.
- **Risk detail modal** (`src/ui/components/Modals/RiskModal.ts`, new): clicking a risk-chart node opens a breakdown — index, level (High/Medium/Low), overdue/maintenance/avg-wear KPIs, program, responsible person, a **summary** of risk drivers, a per-tool table, and an **“Open 5S Report”** button. Wired via `ChartsCallbacks.onOpenRiskDetail` in `src/ui/app.ts`.
- **i18n:** new keys in both dictionaries (`Risk Index`, `Risk Detail`, `Risk level`, `High/Medium/Low`, `Summary`, `Open 5S Report`, `RISK_SUMMARY`, `RISK_GROUP_EMPTY`, `All / No program`, `No posts yet.`); `CULTURE_LEGEND` reworded. Parity 622/622.
- **Assumptions:** “assign a person to a program” is implemented as the cascading Program → Station → Post selector (program derived from the station via `wsProgram`, no new employee field); the risk chart stays a radar (monolith parity) with the Storage/Crib aggregation.

### 0. Deep Modular-Migration Audit & Repair (v104–v106 Releases)

Full-codebase audit of the monolith → modular TS migration: every exported symbol was
traced to its call sites (`rg`/`fd`), every `T()` key checked against both dictionaries,
and every `data-action` emitter matched to its handler. Findings below are split into
**fixed** and **known-but-deferred** (needs a product decision, not a mechanical fix).

**Fixed in this pass:**
- **i18n was ~30% incomplete.** 105 `T()` keys used in code were absent from *both*
dictionaries, so `T()` fell back to the key and RU mode rendered English literals.
Added all of them (EN + RU); dictionaries are now 600/600 keys with 0 missing and 0
duplicates. Note: the old AGENTS.md parity check (equal key counts) could not catch this.
- **Language button lied about the active language.** `Header.render()` hardcoded
`RU | ENG` and `☀️ Light`, and `applyLanguage()` was only ever called from
`setLanguage()` — never at boot. The button now derives both labels from real state
(`getLanguage()`, `data-theme`) and `App.init()` calls `applyLanguage()` before first paint.
- **Version drift.** `Header` hardcoded `v103`; `DetailModal` read `window.CONFIG`
(never assigned) and printed `v98.0.0`; `vite.config.ts` hardcoded `appVersion = 'v98'`
so the SW cache stamp was stuck behind the UI. All now derive from `CONFIG.APP_VERSION`,
and `vite.config.ts` reads it from `src/config/constants.ts` (same source as `build.sh`).
- **Sync: the SSE live relay never transmitted.** `broadcastPing()` had zero callers, so
peers only ever learned about changes via the 15s poll. Now called after a successful push.
- **Sync: 5S audits never synced.** `_buildLocalPayload()` pushed `settings.audits5s`, but
`mergeSettings()` did not merge it and `triggerPull()` did not pass it to `applyLoadedData()`.
Both fixed (union by id, newest-first).
- **Sync: pull→push echo loop.** `triggerPull()` → `Store.save()` → `notify()` → auto-push,
which with the new ping would ping-pong between devices. Added an `_applyingRemote` guard.
- **Order status casing mismatch.** `orderOps` writes `'Received'/'Cancelled'/'Partial'`,
the UI compared `'received'/'cancelled'/'open'` — so received POs kept an OPEN badge, kept
showing “Receive All / Cancel Entire Order”, and the hub's Received/Cancelled counters were
always 0. Added `orderStatusKey()` and routed all readers through it; `submitOrder` now
writes `'Submitted'`.
- **Receiving did not replenish stock.** `OrderModal` called `receiveOrderItem(id, itemId, 1)`
with no target tool, so the `targetToolId` branch never ran — contradicting the shipped FAQ.
Now prompts for qty + optional target Tool ID; `receiveFullOrder` passes `item.toolId`.
- **`workstationAndPostOf()` read fields that do not exist** (`emp.workstation`/`emp.defaultWs`;
`Employee` has `ws`/`post`), so assigned tools always resolved to `Unassigned`. Fixed, plus
`reportExports` personnel sheet now reads `p.ws`.
- **`careOf()` scoring was dead.** It counts `Returned … — Good/Needs Maintenance/Damaged`,
but `returnTool()` wrote the raw numeric score. `returnTool` now writes the label (score kept).
- **Audit log lost `role` and misattributed entries.** `Store.log()` never set `role` and
defaulted `user` to `'operator'`. Added `role` to `AuditLogEntry`, a `Store.actor` published
by `AuthManager` (single setter funnel), and `Store.log()` now defaults to the real actor.
- **5S certificate PDF exported the OLDEST audit.** `Store.audits5s` is newest-first
(`unshift`), but `AuditModal` did `[...audits].reverse()[0]`. Now `audits[0]`.
- **XLSX export failed silently.** No `try/catch` anywhere in `reportExports`; an ExcelJS/quota
error was an unhandled rejection. Wrapped with a CSV fallback + toast (the monolith's
`XLSX_FAILED_CSV` behaviour; the i18n strings had survived the migration unused).
- **Location labels were silently dropped from the print queue.** `printQueueLabels()`
resolved every queued id through `Store.getTool()`, but location labels are queued as
`LOC:…` ids. Now handled via `LabelEntity` and the (previously unreachable) location branch
of `renderLabelCell`.
- **Tool “Program” field (v94) was unsettable.** `Tool.program` is read by `ChartsView` and
`DetailModal` but had **no writer anywhere** in `src/`. Restored the dropdown in add/edit.
Also restored the monolith's `CLASS-NNN` id validation and i18n'd the form toasts.
- **Double action dispatch.** `ToolGrid.bindDelegation()` and `DetailModal.populate()` both
bound `data-action` handlers *and* let the click bubble to the document-level delegation in
`AppUI`, so actions ran twice. Removed the duplicate paths.
- **Procurement hub PO rows were not clickable** (`order-detail` handler existed with no
emitter). Restored.
- **5S report printed near-white on white.** The report uses inline `color:var(--text-main)`
(dark theme), which beat `printHtml`'s `#printZone { color:#111 }`. Added a theme-token
override inside `body.print-zone-mode #printZone` (CSS variables cascade, so inline
`var()` references resolve to print-safe values).
- Smaller: `ScannerModal.open()` no longer reuses a stale callback; removed dead
`LabelModal.openQueuePrint()` and the dead `receive-order-item`/`reject-order-item` switch arms.

**Fixed in the follow-up pass (v105):**
- **Avery sheet layout restored.** `printLabelsHtml()` concatenated cells into `.sheet-mode`,
which had **no CSS rule anywhere**, so nothing lined up with the die-cut stock. The layout is
now built by a pure, unit-tested `buildLabelSheetHtml()`: Letter pages (215.9×279.4 mm) with
each cell absolutely positioned from the stock's `left/top/pitchX/pitchY`, `page-break-after`
between pages, and roll/single stock emitting one stock-sized page per label. Added the
matching `.sheet-mode`/`.sheet-page`/`.sheet-cell` CSS (screen-only dashed guides).
- **Start-position control restored** (`ltmStart` in the monolith): the print modal now takes
a “Start Position” for sheet stock, and `printLabelsHtml`/`printQueueLabels` honour
`{ start }`, so a part-used Avery sheet can be fed back through the printer. `start` applies
only to the first page.
- **`rollbackLastCascade` restored.** `Store.snapshot()` was still being taken on
program/workstation edits and persisted, but nothing could consume it. Added
`Store.rollbackInfo()` and `Store.rollback()` (ported from the monolith, including the
“refuse to apply a corrupt snapshot” guard and the `ROLLBACK` audit entry) plus the
“Rollback Last Cascade” button in the system menu. RBAC stays in the UI layer
(`Auth.doAction('Administrator', …)`) because `Store` must not import `Auth` (cycle).
Covered by 3 new tests in `tests/inventory.test.ts`.

**Fixed in v106 — canonical US date format:**
- `fmtDate()` was hardcoded to `ru-RU` (DD.MM.YYYY) while the printed passport and the Excel
export hardcoded `en-US`, so the same app mixed two conventions and ENG mode still showed
Russian-style dates. `fmtDate()` is now US `M/D/YYYY` and a new `fmtDateTime()` covers
date+time; the remaining hardcoded locales (`reportExports`, `SyncModal`, the Worker photo
viewer) were routed through them. The format is deliberately **locale-independent** — the app
is bilingual and prints controlled documents, where one unambiguous format matters more than
per-language conventions. Covered by `tests/formatters.test.ts` (8 tests).

**Known regressions — still NOT fixed (need a product decision):**
- **Code 39 barcode and `tool.barcode` are still missing.** QR is used on Brady roll stock
where the monolith deliberately emitted Code 39; `exportBradyCSV` also has no equivalent.
- **`BatchRotationModal` replaced the monolith's semantics.** It now moves *all* tools from
WS A to WS B and never touches `status`/`assigneeId` and never calls `Store.log` — the
monolith rotated *problem* tools (overdue/maintenance/wear/cal-due) into Maintenance.
- **`RetireModal` hardcodes wear to 100**, captures no initials/photo, and `decommissionTool()`
never persists `retiredAt/retiredBy/retireReason/retireWear`.
- **`RegistryModal` lost “add workpost”** (nothing writes `Store.workposts` outside seed/sync)
and the move-reg / move-ws / print-loc actions. `openRegEdit` builds a “Target Zone” group
that is then always hidden.
- **5S report lost three sections** (decommissioning stats, procurement recommendations +
detail table, role-addressed Kaizen recommendations — replaced by 4 hardcoded English strings).
The archive modal lost its stats counters and retire-detail columns.
- **Excel export is English-only**; the monolith was fully bilingual (`isRu`).
- **Unwired APIs** (newly authored, no UI — decide wire-or-delete): `calculateKPIs()`
(`MetricsBar` computes inline), `recordToolAudit()`, `submitKaizen()`, `adjustConsumableQty()`,
`rbac.canCheckout/canManageCrib/canAdmin` (dead — `Auth.has()` is used instead),
`SyncModal.renderSyncModalHtml/initSyncModalLogic`, `reportExports.print5sAuditCertificate`.
- **`ToolGrid` `receive-order`/`cancel-order` branch is unreachable** — nothing sets
`status === 'Pending Delivery'` any more (orders live in `procurementLog`).
- **`package.json` version diverged from `CONFIG.APP_VERSION`.** AGENTS.md declares package.json the single source, but `build.sh` read `constants.ts` and `vite.config.ts` hardcoded `'v98'`. **Resolved in v104:** `package.json` is now the only source — Vite injects it as `__APP_VERSION__`, `constants.ts` reads that, and `build.sh` parses package.json. Verified: `sw.js`, `dist/sw.js` and the bundle all report `v104`.

### 0. Dashboard Fixes: Workstation Chart, Search & Work Mode (v103 Release)
- **Workstation chart was dead:** `ChartsView.renderWsChart()` initialised counts only from `Store.workstations` and then did `if (wsCounts[ws] !== undefined) wsCounts[ws]++` — so every tool whose workstation was **not** pre-registered (e.g. seed locations `Shadow Board`, `Tool Crib`, `USS / Center Conveyor`, `Calibration Lab`) was silently dropped. Result: all bars stayed at 0.
  - **Fix:** accumulate any returned workstation (`wsCounts[ws] = (wsCounts[ws] || 0) + 1`), like the monolith `wsLoad[ws] = (wsLoad[ws] || 0) + 1`. Grouping now uses the operations `workstationAndPostOf()` (assignee-first), matching monolith `Ops.workstationOf()`. Bars sorted by load descending.
  - Status donut now includes `Backup` and routes unknown statuses to it (the old object dropped `Backup` — 5 of 22 seeded tools).
  - Added the missing `location` filter branch in `app.ts` (culture-radar click did nothing before); the `workstation` filter now uses `workstationAndPostOf()` too.
- **Tool search did nothing:** `FilterBar.onSearch` only re-filtered the grid, but the grid is hidden while the default view is the Category Hub — so results rendered into an invisible container. **Fix (monolith parity):** a non-empty query switches to the detailed grid view (monolith `onSearchInput()` did `if (searchQuery && viewMode!=='grid') setViewMode('grid')`). Verified headless: typing `wrench` shows the hub `none`, grid `grid`, 3 matching cards.
- **Work mode looked broken:** the class toggled fine, but (a) the button label used a non-existent `Desk Mode` i18n key and reset to "Work Mode" on every header re-render, and (b) the documented `?mode=work` shop-floor shortcut was not implemented. **Fix:**
  - label now shows the TARGET mode (`Dashboard` when work mode is on), derived from the body class in `Header.render()` and repainted by `app.paintModeBtn()`;
  - `setupThemeAndMode()` honours `?mode=work` / `?mode=full` (URL wins, then persisted) and uses `classList.toggle('work-mode', …)`;
  - persisted mode stores `'work'`/`'full'` (legacy `'desk'` still reads as desk mode);
  - leaving work mode redraws the charts; `ChartsView.update()` skips computation while work mode is active (monolith parity);
  - work-mode status select clearing (`''`) now calls `clearFilter()` instead of setting an empty filter.

### 0.1. Dashboard Charts: Hover Tooltips & Risk Details Restored (v101 Release)
- **Regression:** the modular TS rewrite dropped the monolith's interactive chart layer. `renderDonutSvg`, `renderBarSvg` and `renderRadarSvg` had click handlers but **no hover tooltips**, and `ChartsView.computeCulture()`/`compute5S()` were simplified to the point that the risk/culture radar no longer carried Program / Persona / rating-factor data, and the 5S radar lost its best/worst rubric explanations.
- **Fix:**
  - `src/utils/tooltip.ts` — shared `showTooltip`/`hideTooltip` for the single `#svgTooltip` element, clamped to the viewport (ported from the monolith `showTooltip`).
  - `src/reports/radarChart.ts` — restored hover tooltips on donut slices (Count/Percent), bars (Tools/Capacity) and radar nodes (score + description, or a rich `tooltipHtml`). Radar now honours point `color`/`mark` (★ best / ▼ worst), `rated`, dynamic label anchoring/truncation, and `opts.stroke`.
  - `src/ui/components/ChartsView.ts` — `computeCulture()` ported from the monolith: groups by `ws | post` via `Store.workstationAndPostOf`, 0–100 score with overdue/maintenance/wear penalties, resolves Program (`tool.program || Store.wsProgram[ws]`) and Persona (assignee), builds the hover tooltip, and marks best/worst rays; click filters by `location`. `compute5S()` restored the best/worst descriptions with `get5SRubricExplanation` (`AUDIT_BEST`/`AUDIT_WORST`/`AUDIT_SCORE`); clicking a 5S ray still opens the audit-history modal (`AuditModal.openHistory`).
  - Risk panel (`Maintenance & Repair Queue` / `Consumable Wear Trends`) now shows the location label and live hover tooltips (Program / Persona / Reason / Wear) instead of the dead `data-tip` attributes.
- Net effect: as in the monolith — hovering a chart ray/tool shows extra info, clicking opens the modal/filter.

### 0.1. Official REQ-003 Expense Request Restored (v100 Release)
- **Regression:** the modular TypeScript migration replaced the official corporate REQ-003 export with an ExcelJS "from scratch" workbook, producing a wrong, non-corporate form (dark title banner, `#`/Item/Qty/Unit Cost columns) instead of the real `REQ_Expense_Request_<date>.xlsx`.
- **Fix:** `src/procure/req003.ts` now patches the official template cell-by-cell, exactly like the legacy monolith implementation:
  - `src/procure/req003Template.ts` — the corporate workbook (`Form` + `FSE Code` sheets) embedded as base64, **ZIP_STORED (method 0)**.
  - `src/procure/zipStore.ts` — minimal STORED ZIP reader/writer + `patchCell`/`patchFormula` helpers (ported from the monolith). All other archive parts (styles, theme, `FSE Code` dropdown `G7:G22`, merged `A1:D4`, formulas, print setup) are copied byte-for-byte, so formatting is preserved 100%.
  - Cell mapping: `F3` = requestor full name (resolved from personnel initials), `B<row>` = supplier URL, `C<row>` = item name, `D<row>` = qty, `E<row>` = unit cost, `F<row>` = `D*E` (formula + cached value), `H<row>` = reason, `F23` = `SUM(F7:F22)`. Rows 7..21 = 15 line items max (`REQ003_MAX_ITEMS`).
  - Filename is `REQ_Expense_Request_<YYYY-MM-DD>.xlsx`.
- **Template validity fix:** the previously embedded base64 template had three corrupt XML parts (`docProps/custom.xml` shifted by one byte, `xl/styles.xml` and `xl/theme/theme1.xml` truncated). The embedded template is now rebuilt from the clean `template.zip`, so the downloaded workbook is a valid OOXML file (Excel no longer warns about recovery).
- **UI:** `OrderModal.exportExcel` enforces the 15-item limit and surfaces `REQ_LIMIT` / `REQ_FAILED` / `NO_ITEMS_EXPORT` via toasts.

### 0.1. IndexedDB Invariant Hardening, Security & Edge Case Fixes (v97 Release)
- **IndexedDB `onabort` Handlers (`AppDB`):** Added explicit `tx.onabort = () => reject(...)` handlers across all transaction operations (`put`, `delete`, `clear`, `setAll`, `saveAll`, `loadAll`), preventing promise hang on transaction abortion.
- **Empty Database Seed Resurrection Fix (`Store.load`):** Fixed race/lifecycle condition where an empty database with initialized metadata/users would trigger demo data re-seeding. Added initialization check `isInitialized = !!(data.meta?.schemaVersion) || (Array.isArray(data.users) && data.users.length > 0)`.
- **RBAC Enforcement on Registry & State Mutations:** Enforced strict `Auth.has('Administrator')` checks in `Store.removeWorkstation`, `Store.removeWorkpost`, `Store.rollback`, `addRegistryRbac`, and `removeRbacUser`.
- **MediaStream WebRTC Camera Cleanup:** Unified modal closing (`closeModal`) with `Scan.close()` to guarantee `MediaStreamTrack.stop()` on overlay click and `Escape` keypress.
- **XSS & Regex Safety (`Utils.safeUrl`, `Ops.suggestId`):** Sanitized dynamic regex prefix generation in `Ops.suggestId` against special characters. Enforced `Utils.safeUrl` with `rel="noopener noreferrer"` on procurement supplier URLs to block `javascript:` / `data:` URI attacks.
- **Asset Cloning Isolation & Inventory Count Precision:** Cloned tool instances on partial assignment (`Ops.submitAssign`) now reset `photos` to `[]` to prevent cross-deletion of parent photo blobs. `Ops.receiveOrder` and `Ops.receiveOrderItem` hardened for zero-stock items with explicit `sn` and `barcode` assignment.

### 1. Full Migration to Unified IndexedDB Engine (AppDB) (v96 Release)
- **Problem:** `localStorage` has a strict ~5MB-10MB quota, synchronous blocking I/O, and string serialization limits. Heavy inventory operations, large audit trails, high tool counts, and photo attachments risked storage overflows and UI freezes.
- **Solution (`AppDB` Module):** Built a high-performance, asynchronous IndexedDB storage layer with 7 dedicated object stores:
  1. `tools` (keyPath: `id`, indexes: `status`, `category`) — tooling, consumables, serial tracking.
  2. `personnel` (keyPath: `id`, index: `name`) — employee registry.
  3. `users` (keyPath: `username`) — RBAC credentials and permissions.
  4. `audit` (keyPath: `id`, index: `ts`) — immutable audit log.
  5. `procurement` (keyPath: `id`, index: `orderId`) — procurement orders and receiving history.
  6. `settings` (keyPath: `key`) — registries (workstations, workposts, programs, wsProgram, audits5s, meta, labelQueue, rollback).
  7. `photos` (keyPath: `id`, index: `toolId`) — BLOB photo attachments.
- **Automatic Migration Bridge:** Seamlessly reads legacy `inv_inventory_db` or individual legacy keys from `localStorage` on initial boot, saves everything to `AppDB` stores, clears stale localStorage bloat, and migrates legacy photos from `inv_photos_db`.
- **Multi-Tab Sync:** Replaced storage events for database updates with `BroadcastChannel('inv_db_sync')`, notifying other tabs to reload IndexedDB data asynchronously on saves.
- **`localStorage` Strict Isolation:** `localStorage` is exclusively used for `inv_theme`, `inv_lang`, `inv_mode`, `inv_cards`, and `currentUser`.

### 0. Content-Adaptive Modal Widths (v95 Release)
- **Bug:** every modal was capped at `max-width: 600px` (wide at 850px), so table-heavy windows (retired-assets archive, audit log) forced horizontal scrolling on wide desktop screens.
- **Fix (CSS only, `.modal` block):** base sizing is now `width: fit-content; min-width: min(600px, 92vw); max-width: 94vw` — windows size to their content, never narrower than the old 600px on desktop, never wider than the screen. `.modal.wide` floors at 850px and caps at 96vw. `.modal.narrow` stays compact (`min(420px, 92vw)`).
- **Regression guard:** modals with an inline `max-width` (login 420px, label previews 520px, photo viewer 90vw, etc.) keep their legacy sizing via `.modal[style*="max-width"] { width: 90%; min-width: 0; }` — the new 600px floor does not stretch them. Overflow safety: `.table-scroll` already handles both axes; the ≤640px media query still pins `.modal` to 94vw on phones.

### 0. Per-Tool Program Field (v94 Release)
- **Why:** a tool's program existed only implicitly (`location → workstation → wsProgram`), so when the workstations/programs registries are empty there was nothing to derive and nothing to pick in the tool card.
- **New field `t.program`:** optional product program (USS, BAC, WABTEC…). `Program` select added to both `addToolModal` (`#addToolProgram`) and `editToolModal` (`#editToolProgram`), cleared on add-form reset, saved in `submitAddTool`/`submitEditTool` (empty choice deletes the field).
- **Options source:** new `Store.programOptions()` — union of the `programs` registry and `wsProgram` values (wsProgram lives in its own localStorage key `inv_wsProgram` and survives an empty registry). Both selects are filled in `populateAllDropdowns()`; `openEditToolModal` re-fills and preselects the tool's program (unknown values survive via `ensureOption`).
- **Visibility:** detail modal gained a "Program / Workstation / Post" row (`#detProgram`): explicit `t.program`, falling back to `Store.programOf(workstationAndPostOf(t).ws)`, then workstation and post (`Unknown`/`Unassigned` suppressed). Global search now also matches `t.program`.
- **i18n:** keys `Program`, `PROGRAM_HINT`, `PROGRAM_WS_POST` in both dictionaries (parity 470=470).

### 0. Trailing Blank Background Page on Print Removed (v93 Release)
- **Bug:** printing labels (roll/queue and legacy queue paths) always emitted one extra trailing page painted with the app background. Two causes: every queue cell/wrapper carried `page-break-after: always` — including the last one, which spawns a blank page after the final label — and `body`'s theme background (`var(--bg-color)`) painted the print page canvas.
- **Fix (print CSS only):** `body.print-label-mode`/`body.print-zone-mode` now force `background: #fff !important` in `@media print`, and `body.print-label-mode #printLabelContainer > :last-child` resets `page-break-after/break-after: auto !important`, so the last label no longer generates a trailing empty page. Sheet mode (Avery) was already correct and is unaffected.

### 0. Location Label Preview: Type Word Removed (v93 Release)
- The `locationLabelModal` preview card (`Labels.renderLocationPreview`) rendered a bold localized type line («Стеллаж»/Rack) above the address — the word cluttered the label and never matched the actual printed cell (`Labels.renderCell` never prints the type). Preview is now the plain bold address line (`Zone | Rack X | Shelf Y | Bin Z`) plus the optional responsible line.

### 0. Global Search Covers Address Storage (v93 Release)
- **Bug:** `applyFilters`' search only matched `id/name/category/location/assignee/sn` — tools whose location lives in `t.address` (Zone/Rack/Shelf/Bin) were invisible to queries like `rack a` (0 hits with 94 tools actually on Rack A).
- **Fix:** the search predicate now also matches three derived address strings: raw values joined (`tool store rack a shelf 3 bin 5`), EN+RU labeled core values (`rack a стеллаж a shelf 3 полка 3 bin 5 ячейка 5`, existing `Rack/Shelf/Bin` prefixes stripped first), and bare cores (`a 3 5`). Verified against the production backup: `rack a`→94, `rack a shelf 3`→37, `полка 3`→50, `стеллаж a`→94, `rack b`→22, `bin 12`→5, with no regression on legacy queries (`torx`→7, `tool store`→256).

### 0. Photo Viewer Aspect-Ratio Fix (v92 Release)
- **Bug:** the full-size photo viewer (`#photoViewerModal`) distorted photos on desktop — `.modal` is `display:flex; flex-direction:column`, so the `<img id="photoViewerImg">` flex item got squashed/stretched by flex layout when the modal hit `max-height:90vh` (looked fine on phones, broken on scaled desktop displays).
- **Fix:** inline style on `#photoViewerImg` now pins `width:auto; height:auto; flex:none; align-self:center; object-fit:contain` alongside `max-width:100%; max-height:85vh` — the image always keeps its native aspect ratio inside the viewer.

### 0. Batch Location Print Actually Prints (v92 Release)
- **Bug:** `Labels.printLocationBatch('batch')` (the "⚡ Batch Print" button in `locationLabelModal`) fell into the `mode === 'queue' || scope === 'batch'` branch — it silently added all matched location labels to `Store.labelQueue`, showed an English alert, and closed the modal. Nothing was printed and there was no preview, so the button appeared to do nothing.
- **Fix:** after enqueueing, batch scope now immediately sets `Labels.isQueueMode = true` and calls `Labels.prepare(locLabelStock, firstLoc, 'location')`, which opens the standard `printLabelModal` preview of the whole queue (sheet grid or roll, per the stock selected in the location-label modal) with the usual browser print dialog one click away. Queue mode (`Add to Queue`) keeps the old alert behavior. Previously queued labels are never lost — they persist in `localStorage inv_labelQueue` and are printable via the "🖨 Print Queue (N)" button.

### 0. Photo Blobs Moved to IndexedDB — Permanent Quota Fix (v91 Release)
- **`PhotoDB` module:** thin promise wrapper over IndexedDB (`inv_photos_db`, store `photos`, keyPath `id`) with `open/put/get/del`. Graceful degradation: when IndexedDB is unavailable or a write fails, photos fall back to legacy base64 in the tool card (`PhotoDB._failed`).
- **New photo schema:** `t.photos` entries are now metadata-only `{ id, ts, by, retire? }`; the blob lives in IndexedDB. Legacy `{ ts, by, data }` entries remain fully supported (dual-mode rendering).
- **`Photos.attachData(tool, dataUrl, extra)`** is the single write path — used by `Photos.attach`, `Ops.submitAddTool` (now `async`, staged photos) and `Ops.submitRetire` (now `async`, retirement photo).
- **Dual-mode rendering:** `Photos._imgTag(p, size, alt)` emits `data-pid` for IndexedDB photos and inline `src` for legacy base64; `Photos.hydrate(root)` resolves `img[data-pid]` to object URLs after innerHTML renders (detail-modal history, archive list, `Photos.render`). `Photos.remove` also deletes the blob from IndexedDB.
- **Idempotent migration `Store.migratePhotosToIDB()`:** moves every base64 photo into IndexedDB (preserving existing `p.id` when present — same-machine restores do not duplicate blobs), logs `PHOTO_IDB`, saves. Runs on every `init()` chained after `Store.compactPhotos()` (v90), and after `restoreBackup`.
- **Backups stay self-contained:** `Store.exportBackup()` is now `async` and inlines IndexedDB blobs back into `p.data` (base64) on a deep copy — live cards are untouched; restored backups re-migrate to IndexedDB automatically.
- **Result:** the localStorage DB drops from ~4M chars (94% photos) to a few hundred KB — the ~5 MB quota is no longer a constraint, and the "edits lost after PWA update" failure mode is eliminated at the root.

### 0. Rack+Shelf Bin Keying, Photo Quota Rescue & Organizer Bins (v90 Release)
- **Bin Matching by Rack+Shelf Only (root-cause fix):** `getUsedBins`/`getNextFreeBin` no longer filter by zone — in real DBs `workstations` can be empty (the Zone select then has no value) and `address.zone` values (`Tool store`, `ITPS`) do not match the form's zone taxonomy, which silently disabled all bin occupancy detection. Rack letters are the practical unique key.
- **Address Saved Without Zone (`submitAddTool`):** address object is now created whenever Rack+Shelf+Bin are set; previously an empty Zone select produced `address: null` and the tool was invisible to the bin system.
- **Photo Quota Rescue (root cause of "locations reset after updates"):** the DB (~4M chars, 94% photos ≈ 8 MB UTF-16) exceeded the ~5 MB localStorage quota, so `save()` failed and edits made after that were lost on the forced PWA reload. Fixes:
  - One-time async migration `Store.compactPhotos()` (flag `meta.photosCompacted`) recompresses every stored photo to `Photos.MAX_SIDE=640` / `JPEG_Q=0.5` and logs `PHOTO_COMPACT` with before/after sizes. Runs again automatically after restoring an old backup without the flag.
  - New photos are compressed tighter (`Photos` 800/0.62 → 640/0.5; `Utils.compressImageBase64` defaults match).
  - Quota sentry in `Ops.stagePhoto`: adding photos is refused with `PHOTO_QUOTA_WARN` when `Store.estimatedSize()` exceeds 4.3M chars.
- **Organizer Bins:** new `t.organizer` flag with checkboxes (`ORGANIZER_FLAG`) in both `addToolModal` and `editToolModal` (existing cards can be flagged via edit). `Store.getOrganizerBins(rack, shelf)`; a bin holding an organizer never blocks (`getUsedBins` excludes organizer bins even when other items share the bin), renders as `Bin N — 🧰 organizer` (`BIN_ORGANIZER`) and stays selectable; `getNextFreeBin` auto-suggestion prefers fully empty bins. `Store.migrate` normalizes `organizer: false`.
- **Dictionary Parity:** 467 keys in ENG = 467 keys in RU (0 missing).
- **Known follow-up:** move photos from localStorage to IndexedDB (v91 candidate) for a permanent quota solution; `editToolModal` bin list is still the legacy static markup.

### 0. Hardening Patch: Qty Parsing, 5S Rollback Snapshot, CSV Escaping & Excel Lock Password (v87 Release)
- **Receive Order Qty Parsing (`Ops.receiveOrder`):** Fixed string concatenation bug (`"5" + 3 → "53"`) when receiving purchase orders into an existing tool; quantities now summed via `parseInt`.
- **Zero-Qty Migration Guard (`Store.migrate`):** `qty = 0` is no longer treated as missing (`!t.qty` overwrote it with 15); check is now explicit (`undefined`/`null`/`< 0`).
- **LocalStorage Quota Alerting (`Store.save`):** Removed redundant inner try-catch that silently swallowed `QuotaExceededError` into `console.error`; overflow now reliably triggers the `DB_QUOTA_EXCEEDED` alert.
- **Rollback Snapshot Includes 5S Audits:** `Store.snapshot()`/`rollback()` now persist and restore `audits5s`, keeping 5S audit history consistent with tool state after a rollback.
- **Zone Rename Cascade:** `_cascadeTools(fn(parts, sep, tool))` extended; renaming a zone now also updates `t.address.zone`, not just the location string.
- **Radar Chart Labels (`Charts.radar`):** Dynamic `text-anchor` (start/middle/end by spoke angle), long-label truncation and adaptive font size to prevent label overlap.
- **`audit_history` Defensive Guards:** All push/render sites initialize `tool.audit_history || []`; lifecycle rendering no longer throws on legacy tools.
- **CSV Export Escaping:** `Ops.exportAuditLogCSV` and `Reports.exportInventoryCSV` now quote/escape every field; inventory CSV gained `Qty`, `Min Qty`, `Max Qty` columns.
- **Excel Tamper-Lock Password Change:** Worksheet protection password changed from `exportSerial` to the first 16 characters of the export SHA-256 checksum (`checksum.slice(0, 16)`); the stamp row no longer prints the password — unlock via the System Audit Log. FAQ (EN/RU) updated accordingly.
- **Checksum Payload Normalization:** Export hash payload uses `parseInt(t.qty) || 1` and `t.sn || ''` for deterministic signatures.
- **Export UX Loader & Main-Thread Yields (v88):** `Reports.exportInventoryXLSX()` now shows a full-screen spinner overlay (`#loadingOverlay`, key `EXPORT_GENERATING` in both dictionaries) and yields the main thread (`Reports._yieldUI()`) before each worksheet and before `wb.xlsx.writeBuffer()`, so the UI stays alive during the heavy synchronous ExcelJS build/compression phases.
- **Bin Occupancy Guard in Add-Tool Form (v89):** `Store.getUsedBins(zone, rack, shelf)` extracted from `getNextFreeBin`; new `Ops.refreshAddToolBins()` rebuilds `#addToolBin` (Bin 1–50) on every Zone/Rack/Shelf change and on modal open — occupied bins (exact Zone+Rack+Shelf match) are shown as `Bin N — occupied` and `disabled`, the first free bin is auto-selected, and a manual free-bin selection survives shelf switches. New key `BIN_OCCUPIED` in both dictionaries. Note: `editToolModal` still uses the legacy static Bin 1–10 list.

### 0. Full 64-Character SHA-256 Checksum, Copyable Audit Log & Anti-Tamper Excel Sheet Lock (v86 Release)
- **System Audit Log in "System Management" Modal (`systemMenuModal`):** Enhanced the System Audit Log modal (`auditLogModal`) accessible via `⚙ System Management` -> `System Audit Log`:
  - **Live Search & Filter:** Instant search across timestamp, username, role, action type, and details/hashes with a live entry counter (`#auditLogCount`).
  - **Integrated SHA-256 Signature Comparator / Verifier (`Ops.verifyAuditHash`):** Built-in comparator allows administrators to paste any SHA-256 hash or export serial number directly into the search/verify bar to instantly check and authenticate the record against local immutable logs (with green `MATCH` or red `MISMATCH` feedback).
  - **1-Click Copy Buttons (`Utils.copyText`):** Every audit entry featuring a SHA-256 signature includes an inline `📋 Copy` button that copies the clean 64-character hash into the clipboard with automatic toast notification.
- **Full 64-Character SHA-256 in System Audit Trail:** Eliminated truncation of SHA checksums (`slice(0, 16)...`). `Store.log('INVENTORY_EXPORT', ...)` now logs the complete 64-character cryptographic hash, enabling exact 1:1 signature verification between the Excel export stamp, Sheet 5 Audit Log, and the System Audit Log modal.
- **Automated Anti-Tamper Excel Sheet Protection:** All 5 worksheets (`Summary`, `Inventory`, `Personnel`, `Archive`, `Audit Log`) in `Reports.exportInventoryXLSX()` are now automatically locked and protected against unauthorized cell editing and structural alterations using `worksheet.protect(exportSerial, options)`. Sorting and filtering remain available for operators, while tampering with records requires the Export Serial password (which is prominently displayed on Sheet 1's Digital Integrity Seal for authorized admin unlock).
- **Sheet 1 & Sheet 5 Excel Formatting:** Added `Tamper Protection Lock` status row to Sheet 1's Digital Integrity Seal, set monospace formatting (`Courier New`) for hash values on Sheet 1 and Sheet 5, and expanded Sheet 5's Details column to width 85 with text wrapping.
- **Knowledge Base & FAQ Synchronization:** Synchronized English and Russian FAQ Section 5 to document full 64-character SHA snapshot hashes and automated Excel workbook sheet locking.
- **100% Translation Parity:** Verified 462 keys in `translations.ENG` and 462 keys in `translations.RU` (0 missing, 0 placeholder leaks).

### 1. Risk & Incidents Diagram Filtering Fix, i18n Dictionary Completion & v85 Release
- **Risk & Incidents Radar Spoke Filter Resolution:** Fixed an issue where clicking on any spoke or node of the "Risk Index & Incidents" chart (`chartCulture`) displayed the filter banner ("Filtered by Location: ...") but rendered the entire list of active tools in the Tools Store. Added dedicated `f.type === 'location'` filtering in `applyFilters(list)` resolving tool addresses, workstation, and post hierarchies (`Ops.workstationAndPostOf`, `Ops.workstationOf`, and `t.location`).
- **Filter Indicator Label Mapping:** Added `'location': 'Location'` mapping to `TYPE_LABEL` in `setFilter(type, value)` and added `'Location'` / `'Локация'` translation keys to both `ENG` and `RU` dictionaries.
- **Elimination of Remaining EN Placeholder Keys:** Replaced all 27 uppercase placeholder dictionary values in `translations.ENG` (`FILTERED_BY`, `IMPACT_LINE`, `INTEGRITY_FOUND`, `INTEGRITY_OK`, `NO_ROLLBACK`, `POST_EXISTS`, `REMOVE_POST_CONFIRM`, `REMOVE_PROGRAM_CONFIRM`, `REMOVE_ZONE_CONFIRM`, `ROLLBACK_CONFIRM`, `ROLLBACK_DONE`, `ROTATION_HINT`, `RUN_INTEGRITY_NOW`, `STRUCTURE_HINT`, `WP_OVERVIEW`, `ZONE_EXISTS`, etc.) with authentic English localized strings.

### 1. Complete Elimination of English Version Cyrillic Leaks, 100% i18n Parity & v84 Release
- **Zero Cyrillic Leaks on English Mode:** Eliminated all hardcoded Russian text, double slash strings (`Полка / Shelf`, `Стеллаж (Rack)`, `Развернуть все / Expand All`, `Permanent Tooling / Постоянный инструмент`), and untranslated dropdown values across HTML markup, modals, dynamic grid renderers, and Excel export.
- **Pure English Excel Export (All 5 Sheets):** Sheet 1 ("Summary"), Sheet 2 ("Inventory"), Sheet 3 ("Personnel"), Sheet 4 ("Archive"), and Sheet 5 ("Audit Log") generate 100% pure English text when `ENG` language is active with localized table headers, status badges, and digital integrity seal.
- **100% Dictionary Key Parity:** `translations.ENG` and `translations.RU` verified at 449 keys each (0 missing keys, 0 placeholder leaks).
- **Automated QA Verification Suite:** Passed automated syntax evaluation (18 inline scripts), dictionary parity check, markup audit, and export audit with zero failures.
- **Detailed Physical Stock Breakdown Matrix:** Sheet 1 ("Сводка" / "Summary") Digital Verification Stamp block now explicitly breaks down inventory counts into 4 transparent metrics:
  - *Total Unique Catalog Items (SKU) / Уникальных позиций в каталоге (SKU):* e.g. `280 поз.`
  - *Permanent Tooling Stock / Штучный постоянный инструмент:* e.g. `240 шт. (уник. активов)`
  - *Consumable Items in Stock / Расходные материалы на складе:* e.g. `954 шт. (в ячейках/упаковках)`
  - *Grand Total Physical Stock (Pieces) / Итого физических единиц на складе:* e.g. `1 194 шт. суммарно`
- **Granular Export Audit Logging:** `Store.log('INVENTORY_EXPORT', ...)` logs SKU count, permanent piece count, consumable piece count, and grand total units alongside author and SHA-256 hash prefix.
- **Cryptographic Snapshot Fingerprint (SHA-256):** Every exported Excel workbook (`exportInventoryXLSX`) computes a deterministic SHA-256 hash across all active tool IDs, names, types, quantities, statuses, and serial numbers paired with a unique export serial (`EXP-YYYYMMDDHHMMSS-XXXX`) and authenticated author identity.
- **Official Verification Block on Summary Sheet:** Embeds a stylized `DIGITAL INTEGRITY SEAL & VERIFICATION STAMP` block on Sheet 1 detailing Export Serial, Verified Author, SHA-256 Checksum, Total Verified Units, and Security Audit Status.
- **Immutable System Export Logging:** Automatically records an immutable `INVENTORY_EXPORT` audit log entry in `Store.log` with serial, counts, author, and checksum prefix. Any post-export attempt to subtract tools or alter database records creates an instant checksum mismatch and leaves an indelible audit trail.
- **Knowledge Base & FAQ Documentation:** Added complete localized explanations in both Russian (`I18N.RU['FAQ_BODY']`) and English (`I18N.EN['FAQ_BODY']`) Section 5 covering anti-tamper verification and cryptographic snapshot seals.
- **Permanent Tool Stock Logic:** Permanent tools (`type === 'Permanent'`) fix unit presence (`Qty in Stock: 1`) without artificial min/max limits (`minQty = null`, `maxQty = null`), displaying a clean dash (`—`) in Min Qty and Max Qty columns of Excel exports.
- **Consumable Batch Thresholds:** Consumable items (`type === 'Consumable'`) manage real physical stock counts (`Qty in Stock: 15`), minimum reorder triggers (`Min Qty: 5`), and maximum capacity caps (`Max Qty: 20`).
- **Full System Lifecycle Enforcement:** Enforced this strict distinction across `Store.migrate()`, `Ops.submitAddTool()`, `Ops.submitEditTool()`, and `Reports.exportInventoryXLSX()`.
- **DEMIURGOS Agent Model & Thinking Effort Strategy:** Updated `~/.gemini/rules/architecture.md` and all 10 agent manifests in `~/.gemini/config/plugins/demiurgos/agents/*.md` to utilize the new Gemini 3.1 Pro (High effort) and Gemini 3.7 Flash lineup with tuned thinking effort levels.
- **Inventory Sheet Quantity Columns Grouping:** Reordered Sheet 2 ("Инвентарь" / "Inventory") of `Reports.exportInventoryXLSX()` so that all quantity metrics (`Qty in Stock` / `Кол-во в наличии`, `Min Qty` / `Мин. остаток`, `Max Qty` / `Макс. остаток`) are grouped together immediately after Column B (`Name` / `Наименование`).
- **Exact Cell Offset Recalibration:** Updated cell styling offsets: Status badge (Column 9), Wear percentage (Column 15), Overdue return/calibration dates (Columns 13 and 14), and autoFilter range `A1:Q`.
- **Repository Sanitization & `.gitignore` Protection:** Cleaned all temporary and scratch files from the repository directory and established a permanent `.gitignore` rule preventing temporary scripts or test logs from entering Git.
- **Defensive LocalStorage Wrappers:** Wrapped all direct `localStorage` and `sessionStorage` `getItem`/`setItem` operations in safe `try-catch` blocks across UI event handlers, preventing `QuotaExceededError` crashes.
- **Total i18n Dictionary Parity:** Achieved 100% dictionary key symmetry across `I18N.EN` and `I18N.RU`.
- **Defensive LocalStorage Wrappers:** Wrapped all direct `localStorage` and `sessionStorage` `getItem`/`setItem` operations in safe `try-catch` blocks across UI event handlers, preventing `QuotaExceededError` crashes on storage limits or restricted browser profiles.
- **`I18n` & `ProcureCart` Namespace Declarations:** Defined explicit `I18n` module object exposing `currentLang`, `setLanguage`, `T`, and `translations`, and created global `ProcureCart` alias pointing to `Procure`.
- **Labels Personnel Event Handler:** Implemented `Labels.onRespSelectChange(val)` to handle personnel dropdown selections in `locationLabelModal`.
- **Resilient Modal Resolution:** Enhanced `openModal(id)` and `closeModal(id)` to safely validate DOM elements and auto-resolve legacy `reportModal` IDs to `report5sModal`.
- **Global `exportREQ003XLSX` Alias:** Added `Reports.exportREQ003XLSX()` and global `exportREQ003XLSX()` functions calling `ProcureCart.exportXLSX()`.
- **Total i18n Dictionary Parity:** Achieved 100% dictionary key symmetry across `I18N.EN` and `I18N.RU` (24 new keys added).
- **Bilingual Excel Export & Qty Column:** Added Column 6 `Кол-во в наличии / Qty in Stock` to Sheet 2 of `exportInventoryXLSX()` with dynamic bilingual sheet names, block titles, KPI metrics, and table headers.
- **Excel Stock Quantity Column Addition (`Qty in Stock`):** Added Column 6 `Кол-во в наличии / Qty in Stock` to Sheet 2 ("Инвентарь" / "Inventory") in `Reports.exportInventoryXLSX()`, displaying real physical stock quantities (`parseInt(t.qty) || 1`) alongside `Min Qty` and `Max Qty`. Updated column formatting offsets (status col 7, wear col 13, dates col 11/12, autoFilter range `A1:Q`).
- **Complete i18n Audit & Dictionary Parity:** Conducted a comprehensive codebase audit via subagent searcher, identifying 24 missing translation keys in `I18N.EN` and `I18N.RU`. Added all 24 missing keys covering storage location labels, partial receipts, personnel assignments, risk factor drivers, and Excel export columns.
- **Bilingual Excel Export:** `Reports.exportInventoryXLSX()` dynamically evaluates `currentLang` to translate Sheet Names (`Сводка` / `Summary`, `Инвентарь` / `Inventory`, etc.), block titles, KPI metrics, table headers, and ID class legend descriptions.
- **Dynamic Language Detection:** `Reports.exportInventoryXLSX()` dynamically evaluates `const isRu = (typeof currentLang !== 'undefined' && currentLang === 'RU')` to generate 100% localized Excel files.
- **Bilingual Sheet Names:** Sheets adapt automatically: `Сводка` / `Summary`, `Инвентарь` / `Inventory`, `Персонал` / `Personnel`, `Архив` / `Archive`.
- **Bilingual Block Titles & KPI Metrics:** Localized all block titles ('КЛЮЧЕВЫЕ МЕТРИКИ' / 'KEY METRICS', 'ЗАГРУЗКА СТАНЦИЙ' / 'WORKSTATION LOAD', 'ОЦЕНКИ 5S-АУДИТОВ' / '5S AUDIT SCORES', 'РАСПРЕДЕЛЕНИЕ ПО ТИПАМ' / 'TOOL TYPE BREAKDOWN', 'СПРАВОЧНИК ПРЕФИКСОВ ID' / 'ID PREFIX LEGEND') and KPI labels ('Доступно к выдаче' / 'Available for Issue', 'Выдано персоналу' / 'Issued to Personnel', etc.).
- **Bilingual Table Headers & Class Descriptions:** Localized column headers for Sheets 1–4 and dynamically formatted Column 3 `Class Name` (`cls ? (isRu ? `${cls.p} — ${cls.ru}` : `${cls.p} — ${cls.en}`) : (isRu ? 'Индивидуальный ID' : 'Custom ID')`).
- **Location Auto-Recovery:** Automatic migration loop (`Store.migrate`) and cascading shelf key extractor (`getShelfKey`) protect all 280+ positions from location drops or reset errors.
- **Automatic Migration Auto-Recovery (`Store.migrate`):** Added a mandatory auto-recovery loop for all 280+ inventory items. Automatically parses structured `location` strings (e.g. `Zone - Rack - Shelf - Bin`) to build missing `address` objects, and vice versa. Ensures zero position data drops or unassigned address resets.
- **Cascading Shelf Key Extraction (`getShelfKey`):** Updated `renderGrid()` shelf accordion grouping to extract shelf keys hierarchically from `t.address.shelf` -> `_locParts(t.location)` -> `t.location` -> `Main Store`. Prevents stored tools from dropping into `Unassigned` tabs.
- **Bi-directional Form Location Synchronization (`submitEditTool`):** Enforced double-sided location synchronization during tool editing. Updating address form fields automatically re-assembles `tool.location`, while updating `tool.location` auto-populates `tool.address`.
- **Excel Export Refactoring & ID Prefix Legend:** Renamed `'Active on Floor'` to `'Доступно к выдаче / Available for issue'`, added tool type/group breakdowns, generated `СПРАВОЧНИК ПРЕФИКСОВ ID` table on Sheet 1, and added Column 3 `Class Name (Расшифровка ID)` on Sheet 2.
- **Day/Night Theme Tokens Compliance:** Fixed text contrast glitches in Light Theme (Day Mode) by removing non-existent `--card-bg` fallbacks and enforcing `:root` theme tokens.
- **KPI Metric Renaming:** Replaced `'Active on Floor'` with `'Доступно к выдаче / Available for issue'` on Sheet 1 ("Сводка") to accurately reflect inventory status logic (`Active` = stored in crib, ready to issue).
- **Tool & Equipment Type Breakdowns:** Added `TOOL TYPE BREAKDOWN` (`Permanent Tooling` vs `Consumable Stock`) and `TOOL CLASS GROUP BREAKDOWN` (`MECH`, `EL`, `MEAS`, `CONS`) on Sheet 1 ("Сводка").
- **ID Prefix Legend Table:** Generated comprehensive `СПРАВОЧНИК ПРЕФИКСОВ ID / TOOL CLASS LEGEND` table on Sheet 1 detailing all 21 tool classes (`TW`, `PD`, `VT`, `CT`, `CB`, `DC`, etc.) with Prefix, Group, Russian Name, English Name, and Category.
- **Inventory Sheet ID Explanation Column:** Added Column 3 `Class Name (Расшифровка ID)` on Sheet 2 ("Инвентарь"), resolving each tool's prefix into a human-readable Russian/English description (e.g. `CB — Кабельный инструмент (Cable & Wire Tool)`).
- **Day/Night Theme Tokens Compliance:** Replaced hardcoded fallback colors in `Ops.openAuditHistory()` and `renderGrid()` summary cards with system CSS theme tokens (`var(--surface)`, `var(--chip)`, `var(--text-main)`, `var(--text-muted)`), resolving dark-text-on-dark-background glitches in Light Theme mode.
- **Full Rubric Text Integration:** Replaced all legacy `3/2/2/3/3` slash representations in `Charts.compute5S()` tooltips and `Ops.openAuditHistory(pi)` with human-readable score explanations derived from `S5_RUBRICS` via `Ops.get5SRubricExplanation(pi, val)` (e.g. `5/5 (Only what is needed — nothing extra)` or `3/5 (Лишнее есть, но сложено отдельно)`).
- **5S Focus Highlight:** Clicking any ray on the 5S culture radar chart opens the audit history modal with dynamic pillar focus highlighting and color-coded score badges.
- **Storage Label Personnel Dropdown (`locLabelRespSelect`):** Integrated employee dropdown selection in `locationLabelModal` with auto-filling responsible person and live label preview updates.
- **FAQ & Knowledge Base Overhaul:** Rewrote FAQ knowledge base into 5 consolidated, structured accordion sections matching true `v74` capabilities.
- **5S Audit Rubric Score Explanations:** Clicking 5S Radar Chart points or history items resolves human-readable score explanations (`Ops.get5SRubricExplanation`) for every score (1–5) across all 5 pillars (`Sort`, `Set in Order`, `Shine`, `Standardize`, `Sustain`) from `S5_RUBRICS` instead of raw slash strings (e.g. `3/2/2/3/3` -> `3 - Лишнее есть, но сложено отдельно`). Highlighted pillar focus is styled dynamically.
- **Storage Label Personnel Dropdown (`locLabelRespSelect`):** Added `<select id="locLabelRespSelect">` in `locationLabelModal` populated from `Store.personnel`. Selecting an employee auto-fills `#locLabelResponsible` and triggers live sticker preview.
- **FAQ & Knowledge Base Overhaul (`FAQ_BODY`):** Rewrote Russian and English FAQ knowledge base from scratch, consolidating all system features into 5 clean, structured accordion sections matching true `v73` capabilities.
- **Eliminated `| Unknown` Postfix:** Refactored `Ops.workstationAndPostOf` and `Charts.computeCulture` to check `hasPost`. Single-part locations (e.g. `Charging Station`, `Main Store`) render as clean workstation names without trailing `| Unknown`.
- **High-Contrast Dark Theme Text & Badges:** Replaced dark-on-dark text in storage summary cards and shelf accordion headers with high-contrast explicit color tokens (`color: var(--text-main, #f8fafc)` and high-contrast badges `#ffffff` on `--danger`/`--primary`, `#000000` on `--warning`).
- **Bulletproof PWA Auto-Update:** Disabled background polling loops (`setInterval`, `visibilitychange`), enforced single-action clean update pipeline (`unregister` -> `caches.delete` -> `window.location.reload(true)`).
- **Opaque KPI Summary Card:** Replaced translucent `rgba(0,0,0,0.2)` card with a solid opaque container (`background: var(--bg-card, #1e293b); border: 1px solid var(--border); box-shadow: 0 4px 20px rgba(0,0,0,0.3); border-radius: 10px; padding: 20px; margin-bottom: 20px;`).
- **Smart Storage Intelligence Summary (Умное суммирование):** Computes executive metrics across stored items on the structure:
  - Equipment share: `80% Permanent Tooling / 20% Consumables`
  - Action alerts: `⚠️ N items require Maintenance / Service / Calibration`, `🔴 M items Low Stock / High Wear`, `⏰ X items Overdue`.
- **Collapsible Accordion Shelf Tabs (Вкладки Полок `Shelf 1`, `Shelf 2`, etc.):** Groups stored tools by shelf into collapsible accordion tabs (`📂 Полка / Shelf X (N items) [▼/▲]`).
- **Master Accordion Controls:** Added `[📂 Развернуть все / Expand All]` and `[📁 Свернуть все / Collapse All]` calling `Ops.toggleAllShelfTabs()`.
- **PWA Auto-Reload Bug Fix:** Disabled automatic `window.location.reload()` on `controllerchange` to permanently resolve infinite reloading/flashing loops. Users now reload explicitly via the Update Banner or by clicking the `#appVersionTag` (`v71`).
- **100% Russian Coverage:** Audited and resolved all un-localized English strings across HTML elements, modals, options, placeholders, dynamic tables, and charts when RU mode is active.
- **Dictionary Expansion (`I18N.RU`):** Added 30+ missing dictionary keys covering `locationLabelModal`, `assignModal`, `orderDetailModal`, `postAuditModal`, and risk tooltips.
- **Dynamic HTML Option Translation (`applyLanguage`):** Enhanced `applyLanguage()` to query and translate `option[data-i18n]` tags dynamically.
- **Risk Index & Incidents Tooltips (`Workstation | Work Post`):** Enriched culture radar and risk cards to display `Program | Workstation | Work Post | Persona | Reasons` in Russian.
- **Location Storage Labels (`locationLabelModal`):** Added Zone dropdown selector (`#locLabelZoneSelect`), eliminated duplicate prefixing (`cleanPrefix`), and fixed preview card HTML rendering.
- **Line-Item Purchase Orders (`items`):** Purchase Orders now support multiple line items per order (`items: [{ itemId, name, qty, receivedQty, cost, partNo, status, targetToolId }]`).
- **Partial Item Receipts (`receiveOrderItem`):** Each position can be received independently with partial quantities (e.g. receiving 2 out of 5 items today, remaining 3 later). Target tool inventory stock automatically syncs.
- **Item-Level Cancellations/Rejections (`rejectOrderItem`):** Individual line items can be rejected/cancelled with documented cancellation reasons without cancelling the entire purchase order.
- **Dynamic Master Order Status (`recalcOrderStatus`):** Master PO status automatically computes based on line item states (`Pending Delivery` -> `Partially Received` -> `Completed`).
- **Order Detail Modal Table UI:** `orderDetailModal` displays a clean line-items table with row-level action buttons `[📥 Receive]` and `[❌ Reject]`.
- **Dual Employee Selector UX (`assignModal`):** Added explicit clickable dropdown `<select id="assignEmpSelect">` alongside `<input id="assignEmp">`. Users can click to select employees directly from a visible list or type to search; picking an employee instantly auto-fills Workstation, Post, and Required Initials.
- **Assign Tool UI Repair:** Removed accidental export button from `assignModal` and restored full employee selection input with `Ops.onAssignEmpChange()` auto-population.
- **Header Clean-Up:** Removed redundant duplicate un-localized buttons (`Register New Asset` and `Operations`) from `.header-row`. Nav buttons consolidated cleanly in `.toolbar`.
- **Dedicated Storage Location Labels Modal:** Added `[🖨️ Печать этикеток мест хранения]` inside Operations menu (`opsMenuModal`). Introduced `locationLabelModal` with Single/Batch printing, dynamic address auto-completion from `Store.tools`, paper stock choice, and live QRious canvas sticker preview.
- **Storage Structure Types:** Added selection for Rack (Стеллаж), Workbench / Desk (Верстак), Toolbox / Cart (Инструментальный ящик), A-Frame (А-Фрейм).
- **Auto-Increment Free Bin Helper:** Implemented `Store.getNextFreeBin(zone, rack, shelf)` to auto-suggest the next available free bin number and prevent duplicate bin entries on the same shelf.
- **QR Summary Storage View:** Scanning location QRs opens a summary storage view header with responsible person assignment and a table of stored tools sorted by Shelf and Bin.
- **PWA SW Auto-Binding:** `index.html` dynamically registers `./sw.js?v=` + `CONFIG.APP_VERSION`. Changing `APP_VERSION` immediately triggers SW update detection and update banner prompt in browsers.
- **Automated SW Build Pipeline (`build.sh`):** Embedded `build.sh` script automatically extracts `CONFIG.APP_VERSION` and appends Git short commit hash (`v68-b6b67f8`), writing to `sw.js`.
- **CDN Cache-Control (`_headers`):** Added Cloudflare Pages `_headers` file enforcing `Cache-Control: max-age=0, no-cache, no-store, must-revalidate` for `/sw.js`.
- **Startup Protection:** Protected `inv_labelQueue` and `currentUser` `JSON.parse` with safe try-catch fallbacks to prevent startup white-screen crashes on corrupted localStorage.
- **RBAC Gate on Backup Restore:** Restricted `Store.restoreBackup()` strictly to `Administrator` role to prevent unauthorized privilege escalation.
- **Procurement Order Linking Fix:** Enforced strict `targetToolId` matching in `receivedInto` (removed loose fuzzy name matching fallback that merged distinct tools).
- **Address Persistence Fix:** Ensured empty location fields in `submitEditTool()` properly reset or clear address structures instead of inheriting stale rack/shelf/bin data.
- **UI State Quota Protection:** Wrapped `localStorage.setItem('inv_cards', ...)` in `toggleCard()` with try-catch to prevent `QuotaExceededError` crashes.
- **Auto-SN Dynamic Prefixes:** Updated `Utils.isAutoSn()` to support dynamic category prefixes (`CONFIG.TOOL_CLASSES`) alongside `'SN'`.
- **Base64 Photo Canvas Compression:** Added `Utils.compressImageBase64()` helper to downscale uploaded images and protect LocalStorage quotas.

### 1. Procurement & Orders Registry (v58–v59)
- **Procurement Hub (Dashboard):** Dedicated hub on the dashboard showing order summaries by status, total amounts, and recent procurement events with direct links to order cards.
- **Purchase Order Lifecycle:** Introduced dedicated registry for purchase orders with full lifecycle management (status history, comments, audit logs).
- **Two-Way Linking:** Established bidirectional linkage between procurement requests (orders) and physical tools (`receivedInto`).

### 2. Labels, Locations & Personnel Management (v60–v66)
- **Personnel Datalist UX:** Fixed duplicate employee generation. Added smart `<datalist>` for selecting users by initials or name with auto-population of metadata.
- **Location QRs (Rack/Shelf/Bin):** Implemented smart QR code generation and parsing for hierarchy-based physical locations (Rack, Shelf, Bin).
- **Label Scanner Filter:** Scanning a location QR code automatically injects it into a structured location filter rather than a global text search.
- **Label Visuals:** Rewrote the QR payload parser to avoid repeating hardcoded prefixes (Zone, Rack, etc.) and instead dynamically format values (e.g. `Tool store | Rack A | Shelf 1`).
- **Single Page Avery Print Fix:** Repaired single-page label printing by replacing CSS `transform: scale` with accurate absolute millimeter positioning and strict `@media print` rules.
- **Mobile Search Bar:** Improved mobile layout by forcing status filter onto a top row and keeping search and QR buttons optimally sized.

### 3. 5S Audits & Culture (v55–v56)
- **5S Post Audits:** Implemented formal 5S audits for workstations/posts with scoring rubrics.
- **Radar Chart:** 5S culture radar chart is now driven by actual audit score rubrics.
- **5S Report Printing:** Expanded printed 5S reports to include procurement details per position (last receipt, consumption reasons, IDs, needed qty) and a decommissioning section.

### 4. Business Logic & UI Enhancements (v54–v57)
- **Unified Inventory Counts:** Inventory counts strictly unified (purchase orders excluded from raw tool counts).
- **Address Persistence:** Fixed address persistence during transfers, partial merges, and syncing.
- **Article/Part Number:** Added dedicated field for part numbers (article).
- **ExcelJS / REQ003:** Rebuilt `REQ003` (Expense Request) export template with working line formulas and repaired corrupted ExcelJS bundle.
- **Hub Filters:** Dashboard hub buttons filter views correctly.
- **FAQ:** Updated docs (EN/RU) covering auto-SN, article fields, hub filters, order registry, 5S audits, and label layouts.

### 5. Internationalization (i18n) (v53)
- **Full RU Coverage:** 84 new dictionary keys added. `T()` localization function is dynamically used across dashboard logic, alerts, confirms, and toast notifications.

### 6. Prior Core Fixes (v49–v51)
- **Security:** Closed XSS sinks, repaired broken auth gates, and permanently removed cloud autosync (`jsonblob`).
- **Data Integrity:** Wear is calculated via `audit_history` and `updatedAt` stamps; automatic Serial Number (SN) generation smoothed out.

## Multi-Agent Audit & Verification Log (August 2026)
1. **Initial Code Scan (Flash Agent):** Identified potential XSS, unhandled JSON.parse, NULL dereferences, and QuotaExceeded risk.
2. **Deep Architectural Audit (Pro Agent):** Discovered Privilege Escalation in `restoreBackup()`, data destruction in `receivedInto()`, address ghosting in `submitEditTool()`, and Auto-SN prefix mismatches.
3. **Independent QA Verification (Pro QA Agent):** Confirmed real bugs (startup crash, auth bypass, data merge, address persistence, quota error, auto-SN) while filtering out false positives (XSS in `renderSticker` was false positive as `renderCell` already escapes inputs).
4. **Refactoring & Execution:** Architect produced multi-step plan -> Coder executed fixes -> QA Engineer ran `node --check` and validated zero syntax regressions.
5. **SW Versioning Auto-Bind:** Added `sw.js?v=` query param in `index.html`, `build.sh` Git commit hash injection, and `_headers` CDN Cache-Control.
6. **Location Storage Redesign:** Added Storage Types (Rack, Workbench, Toolbox, A-Frame), Auto-free bin helper `getNextFreeBin`, QR summary storage view, and ops menu location print button.
7. **Dual Employee Selector UX:** Restored employee selection in `assignModal`, added clickable `<select id="assignEmpSelect">` with auto-filling workstation, post, and initials.
8. **Line-Item Procurement & Partial Receipts (v69):** Added multi-item PO schema, partial receipt qty tracking (`Ops.receiveOrderItem`), item rejection with reason logging (`Ops.rejectOrderItem`), master status re-calculation (`Ops.recalcOrderStatus`), and `orderDetailModal` line-items table with row-level action buttons.

## Maintenance & Deployment Guidelines
- **Updating App Version:** single source is `package.json` `version` (substituted into the bundle as `CONFIG.APP_VERSION`); `build.sh` stamps `sw.js` from the same value. Do not hand-edit a version string.
- **Cloudflare Pages Build Command:** Configure `bash build.sh` in Cloudflare Pages Build Settings.
- **Local Testing:** Run `./build.sh` locally to verify `sw.js` updates with current commit short hash.

## Enterprise Architecture Plan — Audited & Corrected (2026-09-17, non-release docs change)
`ENTERPRISE_ARCHITECTURE_PLAN.md` was rewritten into a **decision record**. Its previous "current state" section was factually stale (claimed localStorage-only storage, no cloud sync, hardcoded PIN), which made the whole gap analysis misleading. Now:
- **§0 Reality Check** audits each stale claim against the as-built system (IndexedDB 7 stores + blobs, Worker+KV sync with room tokens, ntfy SSE live relay, PBKDF2+RBAC, SHA-256 export stamp + sheet lock).
- **§4 Deliberately NOT Doing** — WASM SQLite/OPFS, Postgres/Aurora+Hyperdrive, Durable Objects/bin locks, CRDT/vector clocks, SAML/OIDC SSO, double-entry ledger, ERP connectors (SAP/NetSuite/Coupa), Logpush→SIEM, microservice split — each with a reason. These are **conscious rejections, not missing features**.
- **§5 Roadmap** — Phase A is the one genuine architectural gap: **deletes are not tombstoned**, so a peer holding an older copy can resurrect a removed record on merge. Also: audit `updatedAt` coverage on every mutation path, and add `/api/health`.
- **§6 SOP & Standards Hub plan** — move the four hardcoded SOPs into `settings.sops` (data-driven, bilingual EN/RU, revision + approval metadata), add an "SOP & Standards" registry tab, surface SOPs contextually on the tool/station card, and log `SOP_VIEW`/`SOP_PRINT` for training evidence.
- **§7 Revisit Triggers** — the explicit condition that would justify each rejected item.
Do not re-open a rejected item on "best practice" grounds unless its trigger has fired.

## Deferred Audit Items (post-MVP, consciously postponed)
A rendering-architecture audit flagged four items. Decision (user, MVP stage): do NOT implement now — the app works and the refactor risk outweighs the benefit. Revisit after MVP:
- Memory leak on re-render (proposal: WeakMap-cached DOM elements).
- No event model (proposal: Observer pattern / EventTarget).
- Inefficient rendering (proposal: lit-html or a diff algorithm).
- Performance: list virtualization / partial rendering.

## "Improvement Patches" Proposal — Verified Against v95 Code (2026-08-21)
An external "improvement patches" document (XSS / quota / salting / partial render / filter cache / DateHelper / ErrorLogger / rAF / self-tests) was checked item-by-item. Verdicts — do not re-verify:
- **NOT applicable (already done):** XSS — all dynamic lists already escape via `Utils.esc` (`detHistory` :8119, audit lifecycle :8136–8138, emp history :8220, `integrityList` :7114); localStorage quota — `Store.save` alert + audit-log trim (1000) + 4M-char warn, `Ops.stagePhoto` sentry at 4.3M, photos in IndexedDB since v91.
- **NOT applicable (duplicates/risky):** DateHelper module (duplicates `Utils.d`/`fmtDate`/`daysUntil`/`durationStr`/`nowISO` + `CONFIG.DAY_MS`); rAF render batching (breaks code reading DOM right after render: `Photos.hydrate` :8127/:8291, QR canvas draws :9045/:9489+, `Charts.update` chained in `init()` :11547); `?test` self-test harness — greenfield, separate decision.
- **Worth doing post-MVP (in priority order):**
  1. **Password hardening (the only real security item):** seed hashes are unsalted SHA-256 (`Utils.hashPw` :2842) and dictionary-weak — seed passwords crack trivially. Change seed passwords, add `Store.meta.salt` with re-hash-on-next-login migration (no change-password flow exists — one must be added). Plain salting without migration breaks all existing hashes on deployed machines.
  2. **Filter caching:** `applyFilters` (:5827) re-runs on every keystroke (`onSearchInput` :5820); memoize the filtered result, invalidate on filter/data change. Input list `Store._activeTools` is already memoized.
  3. **Persist runtime errors:** route `window.error` / `unhandledrejection` (:11596) into `Store.log` instead of console-only.
  4. **Dedup `isOverdue`** — predicate inlined at :8053, :8175, :10654.
  5. **Partial rendering `updateToolCard(toolId)`** (only if grid perf ever matters): needs `data-id` on the card root (:6630) and `renderToolCard` hoisted out of `renderGrid` (:6620); KPI/hub/charts still require full render after mutations.

## File Navigation TOC (2026-08-21, non-release docs change)
- Added a `СОДЕРЖАНИЕ ФАЙЛА` comment block at the top of `index.html` (after the header comment): maps vendor scripts, all `<style>` blocks, markup regions and all 14 JS module banners (`МОДУЛЬ: X`) with line anchors. Comment-only change — no `APP_VERSION` bump. Keep the TOC in sync when adding/moving sections.
- Line numbers cited in this document are as of v95, before the TOC insert (+~45 lines after it).

---

## Modular TypeScript Refactoring & Distributed Cloud Sync Release (v98 - September 2026)

### 1. Monolith Deconstruction & Modular Architecture
- **Monolith Preserved:** Original 12,116-line single-file monolith permanently backed up to `index.monolith.v97.html` (`1,856,480` bytes).
- **Vite 6 + TypeScript 5.6 Pipeline:** Transitioned to modern modular build architecture with strict typing (`strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`).
- **Codebase Modularization:** Decomposed into 14 isolated, cleanly exported submodules:
  - `src/types/`: Strict TypeScript domain interfaces for `inventory.ts`, `procurement.ts`, `personnel.ts`, `audit.ts`, and `sync.ts`.
  - `src/config/`: `constants.ts` with typed categories, 5S rubrics, and application configuration.
  - `src/i18n/`: Bilingual dictionaries (`ru.ts`, `en.ts`) with 472 keys each and 100% parity.
  - `src/storage/`: IndexedDB `AppDB` storage with auto-migration from `localStorage` and quota management for photo blobs.
  - `src/auth/`: RBAC access control with salted SHA-256 password hashing.
  - `src/operations/`: Granular domain logic for tool operations (`toolOps.ts`), purchase order line-item receiving (`orderOps.ts`), and 5S post audits (`auditOps.ts`).
  - `src/labels/`: Canvas/SVG QR generation via `qrcode` and precision Avery 5161/5163/5366 print layouts.
  - `procure/`: Integrated procurement cart and official REQ-003 template patcher (`req003.ts` + `zipStore.ts` + base64 `req003Template.ts`).
  - `reports/`: Warehouse KPI engine, SVG 5S culture radar charts, and Excel export suite.
  - `ui/`: Decoupled stylesheets (`base.css`, `components.css`, `tron-theme.css`, `print.css`) and 19 specialized modal dialogs.

### 2. Distributed Cloud Synchronization (EHS Walkthrough Pattern)
- **Cloudflare Edge Worker (`src/worker/index.ts`):**
  - Authoritative Cloudflare KV namespace persistence (`INVENTORY_KV`) with in-memory fallback.
  - Endpoints:
    - `GET /api/health`: Health status and KV binding detection.
    - `GET /api/sync/:key`: State retrieval with `Cache-Control: no-cache`.
    - `POST /api/sync/:key`: Validates and commits state with 7-day TTL.
    - `GET /api/photo/:room/:photoId`: Serves raw binary images (`?raw=1` / `Accept: image/*`) or renders responsive dark-mode HTML viewer.
    - `POST /api/photo/:room/:photoId`: Uploads photo binary directly into KV.
- **Zero-Data Public Relay Signaling:** Real-time push/pull coordination via `ntfy.sh` SSE relay (`https://ntfy.sh/inv-room-{ROOM}/sse`). Only lightweight, data-free pings are transmitted; all sensitive data travels strictly through the Cloudflare Worker API.
- **Client Synchronization Engine (`src/sync/`):** Persistent `deviceId`, room switching, debounced push (1200ms), automatic periodic poll fallback (15s), and Last-Write-Wins (LWW) entity reconciliation.
- **Sync UI (`SyncModal.ts`):** Real-time status badge in header (🟢 Synced / 🟡 Syncing / 🔵 Pending Push / 🔴 Offline), pairing QR code, shareable room links, and manual push/pull controls.

### 3. QA & Automated Verification
- Full TypeScript check (`tsc --noEmit`): 0 errors.
- Production build (`vite build`): clean bundle with vendor chunk splitting (ExcelJS, QRCode, jsQR).
- Automated Worker test suite: 12 passing test assertions covering all sync, health, photo, and security scenarios.

