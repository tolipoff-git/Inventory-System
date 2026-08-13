# Project Handoff: 5S Tool Command Center v3

## Overview
- **Repository:** `/home/admin/Documents/Inventory-System`
- **Current Version:** `v60` (Version string managed centrally via `CONFIG.APP_VERSION`)
- **Architecture:** Single-file Offline-First PWA (`index.html` monolith ~9,000+ lines). 
- **Storage:** LocalStorage (`inv_inventory_db`) with manual JSON backup/restore. 
- **Platform:** Cloudflare Pages (auto-deploy on push to `main`).

## Recent Accomplishments (v49 – v59)
The application has undergone massive functional and architectural expansion. The current agent should be aware of the following new subsystems and fixes:

### 1. Procurement & Orders Registry (v58–v59)
- **Procurement Hub (Dashboard):** Added a dedicated hub on the dashboard showing order summaries by status, total amounts, and recent procurement events with direct links to the order cards.
- **Purchase Order Lifecycle:** Introduced a dedicated registry for purchase orders with full lifecycle management (status history, comments, audit logs).
- **Two-Way Linking:** Established bidirectional linkage between procurement requests (orders) and physical tools (`receivedInto`).

### 2. 5S Audits & Culture (v55–v56)
- **5S Post Audits:** Implemented formal 5S audits for workstations/posts with scoring rubrics.
- **Radar Chart:** The 5S culture radar chart is now driven by actual audit score rubrics.
- **5S Report Printing:** Expanded the printed 5S reports to include procurement details per position (last receipt, consumption reasons, IDs, needed qty) and a decommissioning section.

### 3. Business Logic & UI Enhancements (v54–v57)
- **Unified Inventory Counts:** Inventory counts are now strictly unified (purchase orders are excluded from raw tool counts).
- **Address Persistence:** Fixed address persistence during transfers, partial merges, and syncing.
- **Article/Part Number:** Added a dedicated field for part numbers (article).
- **ExcelJS / REQ003:** Rebuilt the `REQ003` (Expense Request) export template with working line formulas and repaired the corrupted ExcelJS bundle.
- **Hub Filters:** Dashboard hub buttons now correctly filter views.
- **FAQ:** Updated docs (EN/RU) covering auto-SN, article fields, hub filters, order registry, 5S audits, and label layouts.

### 4. Internationalization (i18n) (v53)
- **Full RU Coverage:** 84 new dictionary keys added. `T()` localization function is now dynamically used across dashboard logic, alerts, confirms, and toast notifications.

### 5. Prior Core Fixes (v49–v51)
- **Security:** Closed XSS sinks, repaired broken auth gates, and permanently removed the dangerous cloud autosync (`jsonblob`).
- **Data Integrity:** Wear is now properly calculated via `audit_history` and `updatedAt` stamps; automatic Serial Number (SN) generation has been smoothed out.

## Next Steps / Known Quirks
- The codebase remains a massive monolith. Any future feature additions should be done with extreme care regarding scope and performance.
- Cloudflare Pages deployment takes ~1-2 minutes. Always wait before clicking "Force Update App" to clear the PWA cache.
- The system is heavily reliant on `LocalStorage`. Watch out for quota limits if adding many high-res photos.
