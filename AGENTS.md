# AGENTS.md — 5S Tool Command Center

## Start here
**Before doing any work, read `project_handoff.md`** — it holds the current version,
the full feature history (v49 → current), and the audit log of past multi-agent work.
Do not re-audit or re-document what is already recorded there; append to it instead.

## Project layout
- `src/` — modular TypeScript PWA (entry `src/main.ts` → `src/ui/app.ts`):
  auth, config, i18n (en/ru), labels, operations, procure, reports, storage,
  sync, types, ui/components, ui/Modals, utils, + `src/worker/index.ts`
  (Cloudflare Worker: sync API + photo route). Build: Vite (`npm run build`).
- `index.html` — 85-line app shell only.
- `index.monolith.v97.html` — legacy single-file monolith (~12k lines), kept
  for reference only; NOT the active app.
  A `СОДЕРЖАНИЕ ФАЙЛА` comment block at the top maps all sections with line
  anchors — keep it in sync when adding or moving modules (`МОДУЛЬ: X` banners).
- `sw.js` — service worker; `CACHE_VERSION` is generated, do not hand-edit.
- `build.sh` — refreshes `sw.js` cache version from `CONFIG.APP_VERSION` + git short hash.
- `project_handoff.md` — session-to-session memory (update it after every release).
- `_headers` — Cloudflare Pages CDN cache rules.

## Conventions
- **Release workflow — do this automatically, do NOT ask the user first:**
  after finishing any change, (1) bump `package.json` `version`, (2) update
  `README.md` and `project_handoff.md`, (3) run `bash build.sh` to refresh the
  `sw.js` cache stamp, (4) commit the feature, (5) commit the refreshed `sw.js`
  as `chore(pwa): refresh sw.js cache version for vNN`, (6) `git push origin main`
  (this auto-deploys to Cloudflare Pages). The user has explicitly asked for this
  end-to-end flow every time without being prompted.
- **Versioning:** single source = `package.json` `version` + build-time
  substitution into the built bundle (`CONFIG.APP_VERSION` in src/config).
  Every release: bump version, update `project_handoff.md`, run `bash build.sh`,
  commit (sw.js cache version refreshes via build.sh — do not hand-edit).
- **Commit style:** conventional commits — `feat(scope): ... vNN release`,
  `fix(scope): ...`, followed by `chore(pwa): refresh sw.js cache version for vNN`.
- **i18n:** every user-facing string must exist in BOTH `translations.ENG` and
  `translations.RU` with identical key sets (100% parity). Verify parity after edits.
- **Storage:** IndexedDB (`inv_inventory_db` + photo blobs) is the source of
  truth; localStorage only for prefs. Optional cloud sync: Cloudflare Worker +
  KV + ntfy SSE (room-token authed, best-effort).
- **Deploy:** push to `main` → Cloudflare Pages auto-deploys via `bash build.sh`.

## Verification before committing
1. Extract all inline `<script>` blocks and run `node --check` on each (18 blocks).
2. Check EN/RU dictionary key parity (equal key counts, no placeholder leaks).
3. Never commit broken syntax or half-finished edits to `main`.
