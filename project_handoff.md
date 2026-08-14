# Project Handoff: 5S Tool Command Center v3

## Overview
- **Repository:** `/home/admin/Documents/Inventory-System`
- **Current Version:** `v66` (Version string managed centrally via `CONFIG.APP_VERSION`)
- **Architecture:** Single-file Offline-First PWA (`index.html` monolith ~9,000+ lines). 
- **Storage:** LocalStorage (`inv_inventory_db`) with manual JSON backup/restore. 
- **Platform:** Cloudflare Pages (auto-deploy on push to `main`).

## Recent Accomplishments (v49 – v66)
The application has undergone massive functional and architectural expansion. The current agent should be aware of the following new subsystems and fixes:

### 1. Procurement & Orders Registry (v58–v59)
- **Procurement Hub (Dashboard):** Added a dedicated hub on the dashboard showing order summaries by status, total amounts, and recent procurement events with direct links to the order cards.
- **Purchase Order Lifecycle:** Introduced a dedicated registry for purchase orders with full lifecycle management (status history, comments, audit logs).
- **Two-Way Linking:** Established bidirectional linkage between procurement requests (orders) and physical tools (`receivedInto`).

### 2. Labels, Locations & Personnel Management (v60–v66)
- **Personnel Datalist UX:** Fixed duplicate employee generation. Added smart `<datalist>` for selecting users by initials or name with auto-population of metadata.
- **Location QRs (Rack/Shelf/Bin):** Implemented smart QR code generation and parsing for hierarchy-based physical locations (Rack, Shelf, Bin).
- **Label Scanner Filter:** Scanning a location QR code automatically injects it into a structured location filter rather than a global text search.
- **Label Visuals:** Rewrote the QR payload parser to avoid repeating hardcoded prefixes (Zone, Rack, etc.) and instead dynamically format values (e.g. `Tool store | Rack A | Shelf 1`).
- **Single Page Avery Print Fix:** Repaired the single-page label printing modality by replacing CSS `transform: scale` with accurate absolute millimeter positioning and strict `@media print` rules.
- **Mobile Search Bar:** Improved mobile layout by forcing the status filter onto a top row and keeping the search and QR button optimally sized.

### 3. 5S Audits & Culture (v55–v56)
- **5S Post Audits:** Implemented formal 5S audits for workstations/posts with scoring rubrics.
- **Radar Chart:** The 5S culture radar chart is now driven by actual audit score rubrics.
- **5S Report Printing:** Expanded the printed 5S reports to include procurement details per position (last receipt, consumption reasons, IDs, needed qty) and a decommissioning section.

### 4. Business Logic & UI Enhancements (v54–v57)
- **Unified Inventory Counts:** Inventory counts are now strictly unified (purchase orders are excluded from raw tool counts).
- **Address Persistence:** Fixed address persistence during transfers, partial merges, and syncing.
- **Article/Part Number:** Added a dedicated field for part numbers (article).
- **ExcelJS / REQ003:** Rebuilt the `REQ003` (Expense Request) export template with working line formulas and repaired the corrupted ExcelJS bundle.
- **Hub Filters:** Dashboard hub buttons now correctly filter views.
- **FAQ:** Updated docs (EN/RU) covering auto-SN, article fields, hub filters, order registry, 5S audits, and label layouts.

### 5. Internationalization (i18n) (v53)
- **Full RU Coverage:** 84 new dictionary keys added. `T()` localization function is now dynamically used across dashboard logic, alerts, confirms, and toast notifications.

### 6. Prior Core Fixes (v49–v51)
- **Security:** Closed XSS sinks, repaired broken auth gates, and permanently removed the dangerous cloud autosync (`jsonblob`).
- **Data Integrity:** Wear is now properly calculated via `audit_history` and `updatedAt` stamps; automatic Serial Number (SN) generation has been smoothed out.

## Next Steps / Known Quirks
- The codebase remains a massive monolith. Any future feature additions should be done with extreme care regarding scope and performance.
- Cloudflare Pages deployment takes ~1-2 minutes. Always wait before clicking "Force Update App" to clear the PWA cache.
- The system is heavily reliant on `LocalStorage`. Watch out for quota limits if adding many high-res photos.
