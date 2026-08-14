# Project Handoff: 5S Tool Command Center v3

## Overview
- **Repository:** `/home/admin/Documents/Inventory-System`
- **Current Version:** `v67` (Version string managed centrally via `CONFIG.APP_VERSION`)
- **Architecture:** Single-file Offline-First PWA (`index.html` monolith ~9,000+ lines). 
- **Storage:** LocalStorage (`inv_inventory_db`) with manual JSON backup/restore. 
- **Platform:** Cloudflare Pages (auto-deploy on push to `main`, using `bash build.sh` build command).

## Recent Accomplishments (v49 – v67)
The application has undergone massive functional and architectural expansion. The current agent should be aware of the following new subsystems and fixes:

### 0. Architecture, Security & SW Auto-Update Refactoring (v67)
- **PWA SW Auto-Binding:** `index.html` dynamically registers `./sw.js?v=` + `CONFIG.APP_VERSION`. Changing `APP_VERSION` immediately triggers SW update detection and update banner prompt in browsers.
- **Automated SW Build Pipeline (`build.sh`):** Embedded `build.sh` script automatically extracts `CONFIG.APP_VERSION` and appends Git short commit hash (`v67-db2f113`), writing to `sw.js`.
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
4. **Refactoring & Execution:** Architect produced 7-step plan -> Coder executed fixes -> QA Engineer ran `node --check` and validated zero syntax regressions.
5. **SW Versioning Auto-Bind:** Added `sw.js?v=` query param in `index.html`, `build.sh` Git commit hash injection, and `_headers` CDN Cache-Control.

## Maintenance & Deployment Guidelines
- **Updating App Version:** Simply change `APP_VERSION` in `CONFIG.APP_VERSION` (in `index.html`).
- **Cloudflare Pages Build Command:** Configure `bash build.sh` in Cloudflare Pages Build Settings.
- **Local Testing:** Run `./build.sh` locally to verify `sw.js` updates with current commit short hash.
