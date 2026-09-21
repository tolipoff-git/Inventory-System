# 5S Tool Command Center — v3 (v123)

Industrial inventory management, 5S compliance, and tool-tracking PWA with
**zero backend maintenance** — pure client-side app + optional Cloudflare
Worker sync, built as a **modular TypeScript/Vite project** (migrated away from
the original single-file monolith).

---

## Stack & Architecture

| Layer | Tech |
|---|---|
| **UI / App** | TypeScript ~5.6 · Vite 6 · React-free components · i18n (en/ru, 1:1 parity) |
| **Storage** | IndexedDB (photos, blobs) + localStorage (prefs) · schema-migrated (`onupgradeneeded`) |
| **Cloud** | Cloudflare Pages (hosting) + **Worker API** (sync, photo fetch) + **KV** + **ntfy.sh SSE relay** for live multi-device push |
| **Extras** | ExcelJS (labels/XLSX/REQ003), JSQR + camera QR scanner, ZXing-free |

```
src/
├── main.ts / ui/            # entry + app shell (screens, toasts, modals)
├── auth/                    # RBAC, login, PIN (PBKDF2), session
├── storage/                 # IDB wrappers, store, seed, migrations
├── sync/                    # Cloud Worker client, live relay (SSE), conflict resolver
├── reports/                 # XLSX export, Excel templates, weekly/audit reports
├── operations/ procure/     # tool lifecycle, procurement logic
├── labels/ config/ i18n/    # label printing, settings, translations
├── worker/index.ts          # Cloudflare Worker (sync API + photo route + auth)
└── utils/                   # crypto, constants, helpers
```

## Key Features

### 1. Inventory lifecycle
- **Serialized & bulk tracking** — expensive assets with auto class prefixes
  (`DW-DRILL-001`), consumable bins with min-stock alerts.
- **Add-tool form** — pick **Type** (Permanent / Consumable) and **Tool Class**; the
  inventory number is auto-filled with the next free `CLASS-NNN` (still editable) and the
  category defaults from the class. A blank Serial Number is auto-generated as
  `CLASS-XXXXXXXX` (recognised as auto everywhere). Calibration **interval (days)** sets the
  next-due date.
- **Immutable audit trails** — Tool ID as primary key; System Audit Log tracks
  issuance, return, edit, retirement.
- **Address storage** — `Zone | Rack | Shelf-Bin` coordinates on create/transfer. The
  **Bin** list is occupancy-aware: cells already taken on that Rack+Shelf are **disabled**
  (`Bin 3 — occupied`), organizer cells are marked (`Bin 5 — 🧰 organizer`) but stay
  selectable, and the next free cell is auto-selected while a manual pick of a still-free
  cell is preserved. The same guard runs on submit, so two tools can never share a cell.
- **Decommissioning** — >75% wear → auto-retire to Archive (kept, off dashboards).

### 2. Analytics & 5S
- Interactive click-to-filter dashboards, Production Culture Radar.
- **Risk Index chart** — one point per **station | post** (0–100 index); tools with no
  resolvable station are aggregated into a single *Storage / Crib* bucket. The best ray is
  marked **★** (green) and the worst **▼** (red). Clicking a node opens a **risk-detail modal**
  (index, level, overdue/maintenance/wear KPIs, program, responsible person, risk-driver
  summary, per-tool table) with a shortcut to the 5S report.
- Care Score (0-100) per employee from return-condition history.
- **5S report** (screen + printable document) — KPIs, 5S pillar scores with rubric findings,
  status breakdown, decommissioning statistics, procurement recommendations & detail,
  workstation load/loss risk, production culture per station|post, and **Kaizen advice
grouped by the role that can act on it**.
- 5S audit reports + automated procurement recommendations.
- Photo timelines — tool condition photos embedded chronologically.

### 2b. Registries & structure
- **Cross-register search** — the tool search (main grid and the Calibration Session) matches
  one shared haystack: id, name, **tool-class label (EN/RU)**, category, spec, program, SN,
  article, storage location, station/post and holder. Case-insensitive and multi-token
  (`torq 1/2` finds “1/2 Torque Wrench”). Because the class name only lives in the id prefix
  (`TW-006` → *Torque Wrench*), searching the class name now works everywhere.
- **Program → Station → Post** hierarchy in *System Registries*: inline add for stations
  and posts, rename/move/delete with cascade, a **“No program (areas)”** group
  (Tool Gage, Machine Shop) and a **“No zone”** group; stations can be detached from a
  program (**— No program —**).
- Personnel are assigned along the same hierarchy (Program → Station → Post).
- **Removals are tombstoned, not erased.** Employees are soft-deleted (`deletedAt`) and
  hidden from lists/pickers/counters, but stay resolvable so tool history keeps real names;
  a holder must return their tools before removal (as in the legacy monolith). Registry
  entries (programs, stations, posts, program links) record a `{t, del}` event so a peer
  holding an older array can no longer resurrect a deleted entry on the next merge.
- **📥 Register missing stations & posts** — rebuilds the registry from the data that
  already references it: personnel `ws`/`post`, `tool.address.zone`, and tool locations
  written as `station / post`. Non-destructive (it never rewrites a tool or a person) and
  idempotent. Bare free-text locations (`Shadow Board`, `Tool Crib`, `Calibration Lab`) are
  reported as storage areas instead of being registered, so the registry does not fill up
  with shelves. Available in the *Programs & Stations* tab and in the Integrity Check.

### 3. Live multi-device sync
- **Cloudflare Worker** (`/api/sync/:roomKey`) — room-authed (Bearer),
  first-write-wins **room token** (X-Sync-Token), constant-time compare.
- **ntfy.sh SSE** — live push; **conflict resolver** = field-level
  later-wins-per-timestamp merge, history union.
- **Tombstoned deletes** — removals travel as data (a `deletedAt` field or a registry
  event), so the newest revision always wins and deleted records stay deleted.
- **`updatedAt` is guaranteed** — `Store.save()` re-stamps every record whose content
  changed since the last write, so a mutation path that forgot `touch()` cannot silently
  lose the edit on merge.
- **Offline-first** — IndexedDB is source of truth; sync is opportunistic.

### 4. Labels & exports
- Label formats **A/B/C** (Code39 + QR), batch printing queue.
- **WYSIWYG preview** — the print dialog renders the *real* label geometry (the same
  `buildLabelSheetHtml` output that goes to the printer), so a sheet-stock run shows the full
  die-cut page with the label in its correct cell instead of a lone centred sample.
- **Addresses in full** — labels never abbreviate: storage coordinates always read
  `Rack A | Shelf 2 | Bin 3`, even for legacy rows that stored a bare `A` / `2` / `3`.
- **Anchored, never centred** — roll/single stock (Brady roll, Generic A/B/C, Calibration Tag)
  is printed at the **page origin**. When a printer rejects the custom `@page` size and falls
  back to Letter/A4, the label lands in the top-left label position instead of floating in the
  middle of the sheet. The verification-tag format is also only offered for classes that
  require verification.
- **Print Queue** (header 🏷 or *Operations & Reports*) — collect labels first, then generate
  the whole sheet on any wired stock (**Avery 5161** / 5163 / 5366, Brady roll, Generic A/B/C,
  Calibration Tag, Calibration Tag Sheet) with a start-cell offset for part-used sheets. The
  dialog shows a **live preview of the whole run** — every queued label laid out in queue
  order on the chosen stock, updating with the format and start cell — plus a **🗑 Clear Queue**
  action. Sheet geometry (`.sheet-page` / `.sheet-cell`) is inlined into the print iframe, so
  die-cut alignment does not depend on the external stylesheet resolving there.
- **Calibration / verification tag** (`calTag`, 70×50 mm) — prints the verification
  block (who verified · date · valid until · certificate #) next to the QR, so a
  scanned tag opens the full tool card. The tag prints on a **clean white page** — the
  print iframe neutralises the app shell, so no theme background or grid lines bleed
  onto the label.
- **REQ003** expense template (xlsx), full **XLSX dump** (Active/Archive/Audit/Personnel).

### 4a. Calibration & verification
- **Verification classes only** — the *Record Calibration* action is offered only for
  classes that need it: **Torque Wrench (TW)**, **Crimping Tool (CT)**, **Meter &
  Diagnostics (DC)**, **Caliper / Micrometer (CA)**, **Gauge / Template (GA)**. Add a prefix
  to `CONFIG.CALIBRATION_PREFIXES` to extend. A socket head or a hammer has no such button.
- **Who verified = a person, not a login** — *Verified by* is a picker over the personnel
  registry (so the tag reads “Igor Tolipov”, not “admin”); the logged-in user is preselected
  only if they exist in personnel. Required before saving.
- **Structured verification record** per tool — `calVerifiedAt`, `calVerifiedBy`,
  `calIntervalDays`, `calCertNo` and a `calHistory[]` log (not just a free-text
  history line). The next due date is computed from `date + interval`.
- **Record Calibration** on any tool (card button / tool grid), regardless of status —
  a freshly installed tool is `Active`, not `Maintenance`, yet still needs its first
  verification. *Complete Maintenance* captures the same fields.
- **Calibration Session** (*Operations & Reports*, or the **Maintenance & Calibration Queue**
  card in the Category Hub) — pick a station, search/tick a shelf of tools (ticks survive
  filtering), stamp one date / inspector / interval / certificate, then print a run of tags.
  The run is laid out **in tick order on the chosen label stock** (default *Calibration Tag
  Sheet*, Avery 5161, **20 tags/sheet**; the tag switches to a compact one-line layout in the
  25.4 mm cell) — not one tag per page. The queue card lists the items due (≤14 days) or
  overdue; each row opens the tool card.
- The tool card shows the verification block and the last five verification events;
  the tag turns red when the next-due date has passed. The block is rendered **only for
  verification classes** (TW/CT/DC/CA/GA) — a socket head or a hammer no longer carries an
  empty “Calibration / Verification” section (a tool that keeps real verification data still
  shows it). If a row carries only the structured `calHistory[]` (e.g. imported from the
  monolith), the card and tag fall back to its newest entry so “who verified” is never blank.
- **Dates are local, not UTC** — a `YYYY-MM-DD` verification date is parsed at local
  midnight, so a tag stamped on the 18th no longer prints as `9/17` in timezones behind UTC.

### 4b. QR round-trip (labels → card)
- Labels encode `…/?tool=ID` / `…/?loc=LOC:…`, using the **origin the app is served from**
  (the deployed constant is only a fallback), so a label printed by a preview/staging/local
  instance round-trips back to that same instance rather than to production. Opening that URL
  (phone camera, shared link, installed PWA) routes straight to the tool card or the storage
  view; the in-app scanner and a wedge barcode scanner resolve the same payloads, including
  bare ids. Parsing lives in `src/utils/scanPayload.ts`.

### 4b. SOP & Standards hub
- Standards are **data, not code** (`settings.sops`): the shop edits them in
  *System Registries* → **SOP & Standards** — no release needed.
- Each document is **bilingual** (EN/RU bodies), carries control metadata
  (code · revision · effective date · approved by · owner role · status) and an
  applicability scope (tool classes / programs / stations / posts).
- Lifecycle **Draft → Approved → Obsolete**; *New Revision* bumps the label,
  re-dates the document and returns it to Draft. Documents are never deleted —
  retiring one means marking it Obsolete, which is what "controlled document"
  means. Every change is written to the audit trail (`SOP_SAVE`, `SOP_STATUS`,
  `SOP_REVISION`).
- The Category Hub SOP card and the SOP modal both render **from the registry**,
  in the active language, with a local EN/RU toggle inside the modal and a
  "controlled document — printed copies are uncontrolled" footer on screen and
  in print.

### 5. Security (hardened)
- **PBKDF2-HMAC-SHA256** (210k iters, salted) for PINs — constant-time verify,
  legacy SHA-256 upgrades on login; first Administrator sets own PIN.
- Worker: constant-time bearer, **origin allowlist** (`ALLOWED_ORIGIN`),
  photo mime + 5 MiB guard. KV binding via env/secret (never in VCS).
- CORS: writes gated by token; client forwards to job-required surfaces only.

### 6. Help & updates
- **FAQ** (❓ in the header) — task-oriented how-to guide: quick start, tool actions,
  structure, storage & labels, **calibration & verification**, procurement, dashboard/risk,
  5S audits, update/offline/data, and a troubleshooting section. Content lives in
  `src/i18n/faqContent.ts`.
- **1-click hard update** — click the version number in the header (or *Update PWA* in the
  menus): clears caches, unregisters the service worker and reloads fresh. Data is untouched.

## Development

```bash
npm ci                    # install
npm run dev               # vite dev server (localhost:3000/3001/5173)
npm run typecheck         # tsc --noEmit
npm run build             # production build (dist/)
npm test                  # vitest 99 tests (crypto, store, conflict, tombstones, registry import, SOP, calibration, worker, migration)
npm run lint              # eslint (strict; legacy no-explicit-any excluded)
npm run check:i18n        # EN/RU key + placeholder parity gate (must stay 1:1)
```

### Deploy (Cloudflare)
```bash
npx wrangler deploy -e staging   # Worker
npm run build && deploy.sh       # Pages static (see deploy.sh for env/kv-substitution)
```
Secrets required: `SYNC_SECRET`, `INVENTORY_KV_BINDING` (KV id) — set via
`wrangler secret put`, **never** commit.

## CI
- GitHub Actions (optional): `npm ci` → `typecheck` → `build` → (on main) deploy
  hook to Cloudflare Pages via `CF_DEPLOY_HOOK_ID`.

## Tests & Quality
- `tests/` — Vitest: crypto (hash/verify/timing), inventory (real Store+fake-indexeddb:
  seed, saveTool, qty split, over-issue, consumable clamp), conflict-resolver
  (later-wins, tie→remote, history union), **registry/personnel tombstones + `updatedAt`
  coverage** (`registrySync.test.ts`), **registry import from existing data**
  (`registryImport.test.ts`), **SOP seeding, lifecycle and merge** (`sop.test.ts`),
  **scan-payload parsing + calibration recording** (`calibration.test.ts`),
  worker auth, legacy migration.
- `npm run check:i18n` — mechanical EN/RU parity gate: equal key sets, identical
  `{placeholder}` sets per key, no Cyrillic left in the English dictionary.
- Lint: ESLint flat config (typescript-eslint recommended + no-empty).
- `tsconfig.json` includes `tests`, so `npm run typecheck` and `npm run build` typecheck
  the suite as well.
- Playwright smoke: button matrix + report flows (text assertions; see
  `tests/`).

## Architecture Notes
- **Single source of truth is IndexedDB**; KV mirrors only for remote peers.
- **Sync is best-effort** — never blocks local work; relay failures degrade to
  polling.
- CORS allowlist + room tokens: multi-room tenant isolation is client-enforced
  (LAN PWA assumption; server enforces token, not room-name uniqueness).

## License
Proprietary — © Igor Tolipov, by Design.