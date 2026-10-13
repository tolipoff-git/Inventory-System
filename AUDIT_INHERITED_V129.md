# Inherited-State Audit — v129 (2026-10-13)

Scope: everything left behind by the previous agent(s) in this repository, audited
against the as-built system. Method: cheap measurement first (`tokei`, `git ls-files`,
`rg`), then targeted reads; every finding cites `file:line` or a live probe.
Nothing here is a re-audit of items already recorded in `project_handoff.md`.

Legend: **[BUG]** real defect · **[DOC]** documentation contradicts reality ·
**[DEAD]** unused artifact · **[RISK]** conscious trade-off worth knowing.

---

## 1. Documentation vs reality

### 1.1 [DOC] Deploy target is described as Cloudflare Pages; the app runs on Workers
- `AGENTS.md:21,29,42`, `README.md:57`, `project_handoff.md:8,28` all say
  "push to `main` → Cloudflare Pages auto-deploys".
- Reality: `wrangler.jsonc` declares a Worker (`name`, `main`, `assets.directory`,
  `kv_namespaces`) and the live origin is `https://inventory-system.tolipoff.workers.dev`
  (verified: `/api/health` responds, `/index.html` → 307). There is no Pages project in play.
- Impact: anyone following the docs looks for build settings in the wrong product;
  the actual deploy path (`npx wrangler deploy`) is undocumented in the release flow.

### 1.2 [DOC] `deploy.sh` is stale and contradicts the committed config
- `deploy.sh:26,54` prints "v98"; it substitutes `$INVENTORY_KV_BINDING` / `$ALLOWED_ORIGIN`
  placeholders (`deploy.sh:38-40`) that **no longer exist** in `wrangler.jsonc` — real KV ids
  and the real origin are committed there now (`wrangler.jsonc:17-32`).
- It also demands env vars that are no longer needed (`deploy.sh:17-24`) and would abort.
- Impact: dead script that fails loudly if anyone trusts it; superseded by `npm run deploy`.

### 1.3 [DOC] Handoff claims a photo upload endpoint that does not exist
- `project_handoff.md:963`: "`POST /api/photo/:room/:photoId`: Uploads photo binary directly into KV."
- Reality: `src/worker/index.ts` handles only GET for `/photo/...` and `/api/photo/...`
  (route regex at line 73; no POST branch). The client uploads through
  `/api/sync/photo_<ROOM>_<id>` instead (`src/sync/syncApi.ts:223`).
- Impact: misleading API contract; a future integrator would implement against a phantom route.

### 1.4 [DOC] Stale line-anchor references to the deleted monolith
- Several deferred-item notes cite monolith line numbers (`Utils.hashPw :2842`,
  `applyFilters :5827`, etc.) from v95. Those anchors are meaningless for the modular tree.
- The monolith itself is still shipped (see §3.1), so the anchors technically resolve,
  but they point at code that is no longer authoritative.

---

## 2. Defects

### 2.1 [BUG] Security headers are lost on static asset responses
- The Worker sets anti-indexing/isolation headers on API responses only
  (`src/worker/index.ts:43-51`) and forwards asset responses with just three headers
  re-added (`src/worker/index.ts:372-375`: `X-Robots-Tag`, `X-Content-Type-Options`,
  `X-Frame-Options`).
- Live probe of `/`: only `cache-control` is present — **no** `X-Robots-Tag`,
  **no** `X-Frame-Options`, **no** `Referrer-Policy`.
- Impact: the privacy posture advertised in comments ("Anti-indexing & strict isolation")
  does not hold for the HTML shell itself; framing protection relies solely on
  crawler etiquette plus `robots.txt`.

### 2.2 [BUG] ~~No global error capture despite an audit log that could hold it~~ — RESOLVED in v131
- `src/utils/errorLogger.ts` funnels `error` / `unhandledrejection` into the persisted log as
  `RUNTIME_ERROR`, fingerprinted and rate-capped; installed from `bootstrap()` after `Store.init()`.
- Unit-tested (`tests/errorLogger.test.ts`). Next planned step belongs to code:
- No `window.onerror` / `unhandledrejection` listener exists anywhere in `src`
  (only element-level handlers such as image/reader errors).
- A previously identified improvement ("persist runtime errors into the audit log")
  remains unimplemented; crashes are console-only and invisible after the fact.

### 2.3 [RISK] Sync API is fully open by design — confirm this is intended
- `/api/sync/:key` has no authentication; the room key *is* the access control
  (`src/worker/index.ts:246-254`, deliberate per v126). Anyone who knows or guesses a room
  key can read and overwrite that room's data.
- This was a conscious decision to make sync work out of the box, but it means data
  confidentiality rests entirely on room-key secrecy. Worth an explicit sign-off.

### 2.4 [RISK] Photos travel through KV as base64 inside sync payloads
- Client uploads photos via `/api/sync/photo_<ROOM>_<id>` (`src/sync/syncApi.ts:214-223`);
  the Worker stores them under the same KV namespace with a size guard of ~5 MiB decoded
  (`src/worker/index.ts:190,389`).
- Consequences to keep in mind: KV value-size ceiling applies, base64 inflates payloads ~33%,
  7-day TTL silently expires photos, and there is no per-photo authorization beyond room key.

---

## 3. Dead weight

### 3.1 [DEAD] ~~Legacy monolith still tracked~~ — RESOLVED in v131
- Removal from HEAD done; archived as annotated tag **`monolith-v97-final`** so the artifact and its
  history stay retrievable without costing clone size for everyone.

### 3.2 [DEAD] ~~Duplicate manifest artifacts~~ — RESOLVED in v131
- Deleted root `manifest.json` and the byte-identical duplicate `public/manifest.json`;
  `public/manifest.webmanifest` (the file `/index.html` actually links) is now the only copy.
- The analogous root/`public/sw.js` duplication was already reconciled in v129.

### 3.3 [DEAD-ish] Template archive — RETAINED deliberately
- Revised finding: the root-level REQ-003 zip (~36 KB) **is** a source artifact — the embedded base64
  template was regenerated from it after three XML parts were found corrupt
  (`project_handoff.md`, "Template validity fix"). Keeping it is intentional provenance, not dead weight.

---

## 4. Consistency / hygiene

### 4.1 Typed escape hatches — hotspot set cleaned in v132, long tail deferred
- Measured before: ~136 `any` sites. After v132: **53 sites across 27 files (−61%)**.
- Cleaned out entirely: `formatters`, `store`, `indexedDb`, `s5Scores`, `reportExports`,
  `app` (window bridge), plus adjacency (`toolOps`, `radarChart`, one modal status check).
  Concrete techniques: real domain types (`RollbackSnapshot`, `Audit5S`, `Employee` legacy fields),
  ExcelJS library types for styles/protection, generic storage methods, typed `declare global`
  contracts for the inline-handler bridge.
- **Latent defect surfaced by the type work and fixed here:** retirement reason/wear/notes were only
  ever written into free-text history, so the export columns reading them were permanently empty;
  `decommissionTool()` now persists structured fields (`retiredAt/Reason/Wear/By/Notes`).
- Remaining tail (~53 sites, ~half of them `catch (e: any)` message extraction): mechanical,
  low-risk but wide; estimated **S–M (1–4 h +25%)**, deliberately not swept blindly in this pass.

### 4.2 Version strings are now single-sourced — keep it that way
- Good news worth recording: version flows from one place into both bundle and SW stamp.
- Residual risk noted earlier (three disagreeing sources) is resolved; do not reintroduce literals.

---

## Priority recommendation

Effort bands are bottoms-up working hours plus a 25% acceptance buffer: **S = 1 h → 1.25 h**,
**M = 4 h → 5 h**, **L = 16 h → 20 h**. Excluded: Cloudflare account access, data migration,
third-party API work. These are lower bounds under ideal assumptions.

| # | Item | Effort | Why now |
|---|---|---|---|
| P1 | §2.1 restore security headers on assets | S | Advertised guarantee currently false |
| P1 | §1.1–§1.3 fix docs to match reality | S | Cheap; prevents wrong deploys/integrations |
| P2 | §3.1–§3.3 prune dead artifacts | S | Shrinks repo, removes confusion |
| P2 | §2.2 global error capture into audit log | M | Diagnosability on shop-floor devices |
| P3 | §4.1 reduce any-density in reports/store | L | Refactor risk > benefit today |

Items §2.3–§2.4 need a product decision, not code.

---

## Progress log

- **P1 — done (v130):** §2.1 baseline headers on the shell, CORS narrowed to the API surface,
  docs/deploy aligned with the real single-Worker deployment (§1.1–§1.3).
- **P2 — done (v131):** §3.1 monolith → tag `monolith-v97-final`, §3.2 duplicate manifests deleted,
  §3.3 template zip retained with reason on record, §2.2 global error capture shipped.
- **P3 — phase 1 done (v132):** hotspot files (§4.1) clean, a real export defect fixed along the way;
  long-tail typing (§4.1) remains and is sized S–M.
