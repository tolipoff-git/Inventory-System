# Project Handoff: 5S Tool Command Center v3

## Overview
- **Repository:** `/home/admin/Documents/Inventory-System`
- **Current Version:** `v71` (Version string managed centrally via `CONFIG.APP_VERSION`)
- **Architecture:** Single-file Offline-First PWA (`index.html` monolith ~9,000+ lines). 
- **Storage:** LocalStorage (`inv_inventory_db`) with manual JSON backup/restore. 
- **Platform:** Cloudflare Pages (auto-deploy on push to `main`, using `bash build.sh` build command).

## Recent Accomplishments (v49 – v71)
The application has undergone massive functional and architectural expansion. The current agent should be aware of the following new subsystems and fixes:

### 0. Smart Location Storage Summary, Collapsible Shelf Accordions & Auto-Reload Fix (v71)
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
- **Updating App Version:** Simply change `APP_VERSION` in `CONFIG.APP_VERSION` (in `index.html`).
- **Cloudflare Pages Build Command:** Configure `bash build.sh` in Cloudflare Pages Build Settings.
- **Local Testing:** Run `./build.sh` locally to verify `sw.js` updates with current commit short hash.
