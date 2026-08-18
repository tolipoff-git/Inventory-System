# AGENTS.md — 5S Tool Command Center

## Start here
**Before doing any work, read `project_handoff.md`** — it holds the current version,
the full feature history (v49 → current), and the audit log of past multi-agent work.
Do not re-audit or re-document what is already recorded there; append to it instead.

## Project layout
- `index.html` — the entire application: a single-file offline-first PWA monolith
  (~11,000 lines: markup, CSS, all JS modules as plain objects — `Store`, `Ops`,
  `Reports`, `Charts`, `Auth`, `Utils`, `Procure`, plus inlined vendor bundles
  ExcelJS/JSZip/QRious). There is no build step for the app itself.
- `sw.js` — service worker; `CACHE_VERSION` is generated, do not hand-edit.
- `build.sh` — refreshes `sw.js` cache version from `CONFIG.APP_VERSION` + git short hash.
- `project_handoff.md` — session-to-session memory (update it after every release).
- `_headers` — Cloudflare Pages CDN cache rules.

## Conventions
- **Versioning:** `CONFIG.APP_VERSION` in `index.html` is the single source of truth.
  Every release: bump it (and the `<b>vNN</b>` badge mentions in both FAQ bodies),
  update `project_handoff.md`, commit, run `bash build.sh`, commit `sw.js` separately.
- **Commit style:** conventional commits — `feat(scope): ... vNN release`,
  `fix(scope): ...`, followed by `chore(pwa): refresh sw.js cache version for vNN`.
- **i18n:** every user-facing string must exist in BOTH `translations.ENG` and
  `translations.RU` with identical key sets (100% parity). Verify parity after edits.
- **Storage:** LocalStorage (`inv_inventory_db`) only; no cloud sync (removed by design).
- **Deploy:** push to `main` → Cloudflare Pages auto-deploys via `bash build.sh`.

## Verification before committing
1. Extract all inline `<script>` blocks and run `node --check` on each (18 blocks).
2. Check EN/RU dictionary key parity (equal key counts, no placeholder leaks).
3. Never commit broken syntax or half-finished edits to `main`.
