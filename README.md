# 5S Tool Command Center — v3 (v107)

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
- **Risk Index chart** — one point per **station | post** (0–100 index); tools outside
  the registry are aggregated into a single *Storage / Crib* bucket. Clicking a node
  opens a **risk-detail modal** (index, level, overdue/maintenance/wear KPIs, program,
  responsible person, risk-driver summary, per-tool table) with a shortcut to the 5S report.
- Care Score (0-100) per employee from return-condition history.
- 5S audit reports + automated procurement recommendations.
- Photo timelines — tool condition photos embedded chronologically.

### 2b. Registries & structure
- **Program → Station → Post** hierarchy in *System Registries*: inline add for stations
  and posts, rename/move/delete with cascade, a **“No program (areas)”** group
  (Tool Gage, Machine Shop) and a **“No zone”** group; stations can be detached from a
  program (**— No program —**).
- Personnel are assigned along the same hierarchy (Program → Station → Post).

### 3. Live multi-device sync
- **Cloudflare Worker** (`/api/sync/:roomKey`) — room-authed (Bearer),
  first-write-wins **room token** (X-Sync-Token), constant-time compare.
- **ntfy.sh SSE** — live push; **conflict resolver** = field-level
  later-wins-per-timestamp merge, history union.
- **Offline-first** — IndexedDB is source of truth; sync is opportunistic.

### 4. Labels & exports
- Label formats **A/B/C** (Code39 + QR), batch printing queue.
- **REQ003** expense template (xlsx), full **XLSX dump** (Active/Archive/Audit/Personnel).
- SOP manuals (Torque/Battery/5S) printable forms.

### 5. Security (hardened)
- **PBKDF2-HMAC-SHA256** (210k iters, salted) for PINs — constant-time verify,
  legacy SHA-256 upgrades on login; first Administrator sets own PIN.
- Worker: constant-time bearer, **origin allowlist** (`ALLOWED_ORIGIN`),
  photo mime + 5 MiB guard. KV binding via env/secret (never in VCS).
- CORS: writes gated by token; client forwards to job-required surfaces only.

## Development

```bash
npm ci                    # install
npm run dev               # vite dev server (localhost:3000/3001/5173)
npm run typecheck         # tsc --noEmit
npm run build             # production build (dist/)
npm test                  # vitest 48 tests (crypto, store, conflict, worker, migration)
npm run lint              # eslint (strict; legacy no-explicit-any excluded)
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
  (later-wins, tie→remote, history union), worker auth, legacy migration.
- Lint: ESLint flat config (typescript-eslint recommended + no-empty).
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