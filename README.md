# 5S Tool Command Center — v3 (v115)

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
- **Immutable audit trails** — Tool ID as primary key; System Audit Log tracks
  issuance, return, edit, retirement.
- **Address storage** — `Zone | Rack | Shelf-Bin` coordinates on create/transfer.
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
- **Calibration / verification tag** (`calTag`, 70×50 mm) — prints the verification
  block (who verified · date · valid until · certificate #) next to the QR, so a
  scanned tag opens the full tool card.
- **REQ003** expense template (xlsx), full **XLSX dump** (Active/Archive/Audit/Personnel).

### 4a. Calibration & verification
- **Structured verification record** per tool — `calVerifiedAt`, `calVerifiedBy`,
  `calIntervalDays`, `calCertNo` and a `calHistory[]` log (not just a free-text
  history line). The next due date is computed from `date + interval`.
- **Record Calibration** on any tool (card button / tool grid), regardless of status —
  a freshly installed tool is `Active`, not `Maintenance`, yet still needs its first
  verification. *Complete Maintenance* captures the same fields.
- **Calibration Session** (*Operations & Reports*) — pick a station, tick a shelf of
  tools, stamp one date / inspector / interval / certificate, then print a run of tags.
- The tool card shows the verification block and the last five verification events;
  the tag turns red when the next-due date has passed.

### 4b. QR round-trip (labels → card)
- Labels encode `…/?tool=ID` / `…/?loc=LOC:…`. Opening that URL (phone camera, shared
  link, installed PWA) routes straight to the tool card or the storage view; the
  in-app scanner and a wedge barcode scanner resolve the same payloads, including
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
  structure, storage & labels, procurement, dashboard/risk, 5S audits, update/offline/data,
  and a troubleshooting section. Content lives in `src/i18n/faqContent.ts`.
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