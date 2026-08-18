# Project Handoff: 5S Tool Command Center v3

## Overview
- **Repository:** `/home/admin/Documents/Inventory-System`
- **Current Version:** `v90` (Version string managed centrally via `CONFIG.APP_VERSION`)
- **Architecture:** Single-file Offline-First PWA (`index.html` monolith ~9,000+ lines). 
- **Storage:** LocalStorage (`inv_inventory_db`) with manual JSON backup/restore. 
- **Platform:** Cloudflare Pages (auto-deploy on push to `main`, using `bash build.sh` build command).

## Recent Accomplishments (v49 – v90)
The application has undergone massive functional and architectural expansion. The current agent should be aware of the following new subsystems and fixes:

### 0. Rack+Shelf Bin Keying, Photo Quota Rescue & Organizer Bins (v90 Release)
- **Bin Matching by Rack+Shelf Only (root-cause fix):** `getUsedBins`/`getNextFreeBin` no longer filter by zone — in real DBs `workstations` can be empty (the Zone select then has no value) and `address.zone` values (`Tool store`, `ITPS`) do not match the form's zone taxonomy, which silently disabled all bin occupancy detection. Rack letters are the practical unique key.
- **Address Saved Without Zone (`submitAddTool`):** address object is now created whenever Rack+Shelf+Bin are set; previously an empty Zone select produced `address: null` and the tool was invisible to the bin system.
- **Photo Quota Rescue (root cause of "locations reset after updates"):** the DB (~4M chars, 94% photos ≈ 8 MB UTF-16) exceeded the ~5 MB localStorage quota, so `save()` failed and edits made after that were lost on the forced PWA reload. Fixes:
  - One-time async migration `Store.compactPhotos()` (flag `meta.photosCompacted`) recompresses every stored photo to `Photos.MAX_SIDE=640` / `JPEG_Q=0.5` and logs `PHOTO_COMPACT` with before/after sizes. Runs again automatically after restoring an old backup without the flag.
  - New photos are compressed tighter (`Photos` 800/0.62 → 640/0.5; `Utils.compressImageBase64` defaults match).
  - Quota sentry in `Ops.stagePhoto`: adding photos is refused with `PHOTO_QUOTA_WARN` when `Store.estimatedSize()` exceeds 4.3M chars.
- **Organizer Bins:** new `t.organizer` flag with checkboxes (`ORGANIZER_FLAG`) in both `addToolModal` and `editToolModal` (existing cards can be flagged via edit). `Store.getOrganizerBins(rack, shelf)`; a bin holding an organizer never blocks (`getUsedBins` excludes organizer bins even when other items share the bin), renders as `Bin N — 🧰 organizer` (`BIN_ORGANIZER`) and stays selectable; `getNextFreeBin` auto-suggestion prefers fully empty bins. `Store.migrate` normalizes `organizer: false`.
- **Dictionary Parity:** 467 keys in ENG = 467 keys in RU (0 missing).
- **Known follow-up:** move photos from localStorage to IndexedDB (v91 candidate) for a permanent quota solution; `editToolModal` bin list is still the legacy static markup.

### 0. Hardening Patch: Qty Parsing, 5S Rollback Snapshot, CSV Escaping & Excel Lock Password (v87 Release)
- **Receive Order Qty Parsing (`Ops.receiveOrder`):** Fixed string concatenation bug (`"5" + 3 → "53"`) when receiving purchase orders into an existing tool; quantities now summed via `parseInt`.
- **Zero-Qty Migration Guard (`Store.migrate`):** `qty = 0` is no longer treated as missing (`!t.qty` overwrote it with 15); check is now explicit (`undefined`/`null`/`< 0`).
- **LocalStorage Quota Alerting (`Store.save`):** Removed redundant inner try-catch that silently swallowed `QuotaExceededError` into `console.error`; overflow now reliably triggers the `DB_QUOTA_EXCEEDED` alert.
- **Rollback Snapshot Includes 5S Audits:** `Store.snapshot()`/`rollback()` now persist and restore `audits5s`, keeping 5S audit history consistent with tool state after a rollback.
- **Zone Rename Cascade:** `_cascadeTools(fn(parts, sep, tool))` extended; renaming a zone now also updates `t.address.zone`, not just the location string.
- **Radar Chart Labels (`Charts.radar`):** Dynamic `text-anchor` (start/middle/end by spoke angle), long-label truncation and adaptive font size to prevent label overlap.
- **`audit_history` Defensive Guards:** All push/render sites initialize `tool.audit_history || []`; lifecycle rendering no longer throws on legacy tools.
- **CSV Export Escaping:** `Ops.exportAuditLogCSV` and `Reports.exportInventoryCSV` now quote/escape every field; inventory CSV gained `Qty`, `Min Qty`, `Max Qty` columns.
- **Excel Tamper-Lock Password Change:** Worksheet protection password changed from `exportSerial` to the first 16 characters of the export SHA-256 checksum (`checksum.slice(0, 16)`); the stamp row no longer prints the password — unlock via the System Audit Log. FAQ (EN/RU) updated accordingly.
- **Checksum Payload Normalization:** Export hash payload uses `parseInt(t.qty) || 1` and `t.sn || ''` for deterministic signatures.
- **Export UX Loader & Main-Thread Yields (v88):** `Reports.exportInventoryXLSX()` now shows a full-screen spinner overlay (`#loadingOverlay`, key `EXPORT_GENERATING` in both dictionaries) and yields the main thread (`Reports._yieldUI()`) before each worksheet and before `wb.xlsx.writeBuffer()`, so the UI stays alive during the heavy synchronous ExcelJS build/compression phases.
- **Bin Occupancy Guard in Add-Tool Form (v89):** `Store.getUsedBins(zone, rack, shelf)` extracted from `getNextFreeBin`; new `Ops.refreshAddToolBins()` rebuilds `#addToolBin` (Bin 1–50) on every Zone/Rack/Shelf change and on modal open — occupied bins (exact Zone+Rack+Shelf match) are shown as `Bin N — occupied` and `disabled`, the first free bin is auto-selected, and a manual free-bin selection survives shelf switches. New key `BIN_OCCUPIED` in both dictionaries. Note: `editToolModal` still uses the legacy static Bin 1–10 list.

### 0. Full 64-Character SHA-256 Checksum, Copyable Audit Log & Anti-Tamper Excel Sheet Lock (v86 Release)
- **System Audit Log in "System Management" Modal (`systemMenuModal`):** Enhanced the System Audit Log modal (`auditLogModal`) accessible via `⚙ System Management` -> `System Audit Log`:
  - **Live Search & Filter:** Instant search across timestamp, username, role, action type, and details/hashes with a live entry counter (`#auditLogCount`).
  - **Integrated SHA-256 Signature Comparator / Verifier (`Ops.verifyAuditHash`):** Built-in comparator allows administrators to paste any SHA-256 hash or export serial number directly into the search/verify bar to instantly check and authenticate the record against local immutable logs (with green `MATCH` or red `MISMATCH` feedback).
  - **1-Click Copy Buttons (`Utils.copyText`):** Every audit entry featuring a SHA-256 signature includes an inline `📋 Copy` button that copies the clean 64-character hash into the clipboard with automatic toast notification.
- **Full 64-Character SHA-256 in System Audit Trail:** Eliminated truncation of SHA checksums (`slice(0, 16)...`). `Store.log('INVENTORY_EXPORT', ...)` now logs the complete 64-character cryptographic hash, enabling exact 1:1 signature verification between the Excel export stamp, Sheet 5 Audit Log, and the System Audit Log modal.
- **Automated Anti-Tamper Excel Sheet Protection:** All 5 worksheets (`Summary`, `Inventory`, `Personnel`, `Archive`, `Audit Log`) in `Reports.exportInventoryXLSX()` are now automatically locked and protected against unauthorized cell editing and structural alterations using `worksheet.protect(exportSerial, options)`. Sorting and filtering remain available for operators, while tampering with records requires the Export Serial password (which is prominently displayed on Sheet 1's Digital Integrity Seal for authorized admin unlock).
- **Sheet 1 & Sheet 5 Excel Formatting:** Added `Tamper Protection Lock` status row to Sheet 1's Digital Integrity Seal, set monospace formatting (`Courier New`) for hash values on Sheet 1 and Sheet 5, and expanded Sheet 5's Details column to width 85 with text wrapping.
- **Knowledge Base & FAQ Synchronization:** Synchronized English and Russian FAQ Section 5 to document full 64-character SHA snapshot hashes and automated Excel workbook sheet locking.
- **100% Translation Parity:** Verified 462 keys in `translations.ENG` and 462 keys in `translations.RU` (0 missing, 0 placeholder leaks).

### 1. Risk & Incidents Diagram Filtering Fix, i18n Dictionary Completion & v85 Release
- **Risk & Incidents Radar Spoke Filter Resolution:** Fixed an issue where clicking on any spoke or node of the "Risk Index & Incidents" chart (`chartCulture`) displayed the filter banner ("Filtered by Location: ...") but rendered the entire list of active tools in the Tools Store. Added dedicated `f.type === 'location'` filtering in `applyFilters(list)` resolving tool addresses, workstation, and post hierarchies (`Ops.workstationAndPostOf`, `Ops.workstationOf`, and `t.location`).
- **Filter Indicator Label Mapping:** Added `'location': 'Location'` mapping to `TYPE_LABEL` in `setFilter(type, value)` and added `'Location'` / `'Локация'` translation keys to both `ENG` and `RU` dictionaries.
- **Elimination of Remaining EN Placeholder Keys:** Replaced all 27 uppercase placeholder dictionary values in `translations.ENG` (`FILTERED_BY`, `IMPACT_LINE`, `INTEGRITY_FOUND`, `INTEGRITY_OK`, `NO_ROLLBACK`, `POST_EXISTS`, `REMOVE_POST_CONFIRM`, `REMOVE_PROGRAM_CONFIRM`, `REMOVE_ZONE_CONFIRM`, `ROLLBACK_CONFIRM`, `ROLLBACK_DONE`, `ROTATION_HINT`, `RUN_INTEGRITY_NOW`, `STRUCTURE_HINT`, `WP_OVERVIEW`, `ZONE_EXISTS`, etc.) with authentic English localized strings.

### 1. Complete Elimination of English Version Cyrillic Leaks, 100% i18n Parity & v84 Release
- **Zero Cyrillic Leaks on English Mode:** Eliminated all hardcoded Russian text, double slash strings (`Полка / Shelf`, `Стеллаж (Rack)`, `Развернуть все / Expand All`, `Permanent Tooling / Постоянный инструмент`), and untranslated dropdown values across HTML markup, modals, dynamic grid renderers, and Excel export.
- **Pure English Excel Export (All 5 Sheets):** Sheet 1 ("Summary"), Sheet 2 ("Inventory"), Sheet 3 ("Personnel"), Sheet 4 ("Archive"), and Sheet 5 ("Audit Log") generate 100% pure English text when `ENG` language is active with localized table headers, status badges, and digital integrity seal.
- **100% Dictionary Key Parity:** `translations.ENG` and `translations.RU` verified at 449 keys each (0 missing keys, 0 placeholder leaks).
- **Automated QA Verification Suite:** Passed automated syntax evaluation (18 inline scripts), dictionary parity check, markup audit, and export audit with zero failures.
- **Detailed Physical Stock Breakdown Matrix:** Sheet 1 ("Сводка" / "Summary") Digital Verification Stamp block now explicitly breaks down inventory counts into 4 transparent metrics:
  - *Total Unique Catalog Items (SKU) / Уникальных позиций в каталоге (SKU):* e.g. `280 поз.`
  - *Permanent Tooling Stock / Штучный постоянный инструмент:* e.g. `240 шт. (уник. активов)`
  - *Consumable Items in Stock / Расходные материалы на складе:* e.g. `954 шт. (в ячейках/упаковках)`
  - *Grand Total Physical Stock (Pieces) / Итого физических единиц на складе:* e.g. `1 194 шт. суммарно`
- **Granular Export Audit Logging:** `Store.log('INVENTORY_EXPORT', ...)` logs SKU count, permanent piece count, consumable piece count, and grand total units alongside author and SHA-256 hash prefix.
- **Cryptographic Snapshot Fingerprint (SHA-256):** Every exported Excel workbook (`exportInventoryXLSX`) computes a deterministic SHA-256 hash across all active tool IDs, names, types, quantities, statuses, and serial numbers paired with a unique export serial (`EXP-YYYYMMDDHHMMSS-XXXX`) and authenticated author identity.
- **Official Verification Block on Summary Sheet:** Embeds a stylized `DIGITAL INTEGRITY SEAL & VERIFICATION STAMP` block on Sheet 1 detailing Export Serial, Verified Author, SHA-256 Checksum, Total Verified Units, and Security Audit Status.
- **Immutable System Export Logging:** Automatically records an immutable `INVENTORY_EXPORT` audit log entry in `Store.log` with serial, counts, author, and checksum prefix. Any post-export attempt to subtract tools or alter database records creates an instant checksum mismatch and leaves an indelible audit trail.
- **Knowledge Base & FAQ Documentation:** Added complete localized explanations in both Russian (`I18N.RU['FAQ_BODY']`) and English (`I18N.EN['FAQ_BODY']`) Section 5 covering anti-tamper verification and cryptographic snapshot seals.
- **Permanent Tool Stock Logic:** Permanent tools (`type === 'Permanent'`) fix unit presence (`Qty in Stock: 1`) without artificial min/max limits (`minQty = null`, `maxQty = null`), displaying a clean dash (`—`) in Min Qty and Max Qty columns of Excel exports.
- **Consumable Batch Thresholds:** Consumable items (`type === 'Consumable'`) manage real physical stock counts (`Qty in Stock: 15`), minimum reorder triggers (`Min Qty: 5`), and maximum capacity caps (`Max Qty: 20`).
- **Full System Lifecycle Enforcement:** Enforced this strict distinction across `Store.migrate()`, `Ops.submitAddTool()`, `Ops.submitEditTool()`, and `Reports.exportInventoryXLSX()`.
- **DEMIURGOS Agent Model & Thinking Effort Strategy:** Updated `~/.gemini/rules/architecture.md` and all 10 agent manifests in `~/.gemini/config/plugins/demiurgos/agents/*.md` to utilize the new Gemini 3.1 Pro (High effort) and Gemini 3.7 Flash lineup with tuned thinking effort levels.
- **Inventory Sheet Quantity Columns Grouping:** Reordered Sheet 2 ("Инвентарь" / "Inventory") of `Reports.exportInventoryXLSX()` so that all quantity metrics (`Qty in Stock` / `Кол-во в наличии`, `Min Qty` / `Мин. остаток`, `Max Qty` / `Макс. остаток`) are grouped together immediately after Column B (`Name` / `Наименование`).
- **Exact Cell Offset Recalibration:** Updated cell styling offsets: Status badge (Column 9), Wear percentage (Column 15), Overdue return/calibration dates (Columns 13 and 14), and autoFilter range `A1:Q`.
- **Repository Sanitization & `.gitignore` Protection:** Cleaned all temporary and scratch files from the repository directory and established a permanent `.gitignore` rule preventing temporary scripts or test logs from entering Git.
- **Defensive LocalStorage Wrappers:** Wrapped all direct `localStorage` and `sessionStorage` `getItem`/`setItem` operations in safe `try-catch` blocks across UI event handlers, preventing `QuotaExceededError` crashes.
- **Total i18n Dictionary Parity:** Achieved 100% dictionary key symmetry across `I18N.EN` and `I18N.RU`.
- **Defensive LocalStorage Wrappers:** Wrapped all direct `localStorage` and `sessionStorage` `getItem`/`setItem` operations in safe `try-catch` blocks across UI event handlers, preventing `QuotaExceededError` crashes on storage limits or restricted browser profiles.
- **`I18n` & `ProcureCart` Namespace Declarations:** Defined explicit `I18n` module object exposing `currentLang`, `setLanguage`, `T`, and `translations`, and created global `ProcureCart` alias pointing to `Procure`.
- **Labels Personnel Event Handler:** Implemented `Labels.onRespSelectChange(val)` to handle personnel dropdown selections in `locationLabelModal`.
- **Resilient Modal Resolution:** Enhanced `openModal(id)` and `closeModal(id)` to safely validate DOM elements and auto-resolve legacy `reportModal` IDs to `report5sModal`.
- **Global `exportREQ003XLSX` Alias:** Added `Reports.exportREQ003XLSX()` and global `exportREQ003XLSX()` functions calling `ProcureCart.exportXLSX()`.
- **Total i18n Dictionary Parity:** Achieved 100% dictionary key symmetry across `I18N.EN` and `I18N.RU` (24 new keys added).
- **Bilingual Excel Export & Qty Column:** Added Column 6 `Кол-во в наличии / Qty in Stock` to Sheet 2 of `exportInventoryXLSX()` with dynamic bilingual sheet names, block titles, KPI metrics, and table headers.
- **Excel Stock Quantity Column Addition (`Qty in Stock`):** Added Column 6 `Кол-во в наличии / Qty in Stock` to Sheet 2 ("Инвентарь" / "Inventory") in `Reports.exportInventoryXLSX()`, displaying real physical stock quantities (`parseInt(t.qty) || 1`) alongside `Min Qty` and `Max Qty`. Updated column formatting offsets (status col 7, wear col 13, dates col 11/12, autoFilter range `A1:Q`).
- **Complete i18n Audit & Dictionary Parity:** Conducted a comprehensive codebase audit via subagent searcher, identifying 24 missing translation keys in `I18N.EN` and `I18N.RU`. Added all 24 missing keys covering storage location labels, partial receipts, personnel assignments, risk factor drivers, and Excel export columns.
- **Bilingual Excel Export:** `Reports.exportInventoryXLSX()` dynamically evaluates `currentLang` to translate Sheet Names (`Сводка` / `Summary`, `Инвентарь` / `Inventory`, etc.), block titles, KPI metrics, table headers, and ID class legend descriptions.
- **Dynamic Language Detection:** `Reports.exportInventoryXLSX()` dynamically evaluates `const isRu = (typeof currentLang !== 'undefined' && currentLang === 'RU')` to generate 100% localized Excel files.
- **Bilingual Sheet Names:** Sheets adapt automatically: `Сводка` / `Summary`, `Инвентарь` / `Inventory`, `Персонал` / `Personnel`, `Архив` / `Archive`.
- **Bilingual Block Titles & KPI Metrics:** Localized all block titles ('КЛЮЧЕВЫЕ МЕТРИКИ' / 'KEY METRICS', 'ЗАГРУЗКА СТАНЦИЙ' / 'WORKSTATION LOAD', 'ОЦЕНКИ 5S-АУДИТОВ' / '5S AUDIT SCORES', 'РАСПРЕДЕЛЕНИЕ ПО ТИПАМ' / 'TOOL TYPE BREAKDOWN', 'СПРАВОЧНИК ПРЕФИКСОВ ID' / 'ID PREFIX LEGEND') and KPI labels ('Доступно к выдаче' / 'Available for Issue', 'Выдано персоналу' / 'Issued to Personnel', etc.).
- **Bilingual Table Headers & Class Descriptions:** Localized column headers for Sheets 1–4 and dynamically formatted Column 3 `Class Name` (`cls ? (isRu ? `${cls.p} — ${cls.ru}` : `${cls.p} — ${cls.en}`) : (isRu ? 'Индивидуальный ID' : 'Custom ID')`).
- **Location Auto-Recovery:** Automatic migration loop (`Store.migrate`) and cascading shelf key extractor (`getShelfKey`) protect all 280+ positions from location drops or reset errors.
- **Automatic Migration Auto-Recovery (`Store.migrate`):** Added a mandatory auto-recovery loop for all 280+ inventory items. Automatically parses structured `location` strings (e.g. `Zone - Rack - Shelf - Bin`) to build missing `address` objects, and vice versa. Ensures zero position data drops or unassigned address resets.
- **Cascading Shelf Key Extraction (`getShelfKey`):** Updated `renderGrid()` shelf accordion grouping to extract shelf keys hierarchically from `t.address.shelf` -> `_locParts(t.location)` -> `t.location` -> `Main Store`. Prevents stored tools from dropping into `Unassigned` tabs.
- **Bi-directional Form Location Synchronization (`submitEditTool`):** Enforced double-sided location synchronization during tool editing. Updating address form fields automatically re-assembles `tool.location`, while updating `tool.location` auto-populates `tool.address`.
- **Excel Export Refactoring & ID Prefix Legend:** Renamed `'Active on Floor'` to `'Доступно к выдаче / Available for issue'`, added tool type/group breakdowns, generated `СПРАВОЧНИК ПРЕФИКСОВ ID` table on Sheet 1, and added Column 3 `Class Name (Расшифровка ID)` on Sheet 2.
- **Day/Night Theme Tokens Compliance:** Fixed text contrast glitches in Light Theme (Day Mode) by removing non-existent `--card-bg` fallbacks and enforcing `:root` theme tokens.
- **KPI Metric Renaming:** Replaced `'Active on Floor'` with `'Доступно к выдаче / Available for issue'` on Sheet 1 ("Сводка") to accurately reflect inventory status logic (`Active` = stored in crib, ready to issue).
- **Tool & Equipment Type Breakdowns:** Added `TOOL TYPE BREAKDOWN` (`Permanent Tooling` vs `Consumable Stock`) and `TOOL CLASS GROUP BREAKDOWN` (`MECH`, `EL`, `MEAS`, `CONS`) on Sheet 1 ("Сводка").
- **ID Prefix Legend Table:** Generated comprehensive `СПРАВОЧНИК ПРЕФИКСОВ ID / TOOL CLASS LEGEND` table on Sheet 1 detailing all 21 tool classes (`TW`, `PD`, `VT`, `CT`, `CB`, `DC`, etc.) with Prefix, Group, Russian Name, English Name, and Category.
- **Inventory Sheet ID Explanation Column:** Added Column 3 `Class Name (Расшифровка ID)` on Sheet 2 ("Инвентарь"), resolving each tool's prefix into a human-readable Russian/English description (e.g. `CB — Кабельный инструмент (Cable & Wire Tool)`).
- **Day/Night Theme Tokens Compliance:** Replaced hardcoded fallback colors in `Ops.openAuditHistory()` and `renderGrid()` summary cards with system CSS theme tokens (`var(--surface)`, `var(--chip)`, `var(--text-main)`, `var(--text-muted)`), resolving dark-text-on-dark-background glitches in Light Theme mode.
- **Full Rubric Text Integration:** Replaced all legacy `3/2/2/3/3` slash representations in `Charts.compute5S()` tooltips and `Ops.openAuditHistory(pi)` with human-readable score explanations derived from `S5_RUBRICS` via `Ops.get5SRubricExplanation(pi, val)` (e.g. `5/5 (Only what is needed — nothing extra)` or `3/5 (Лишнее есть, но сложено отдельно)`).
- **5S Focus Highlight:** Clicking any ray on the 5S culture radar chart opens the audit history modal with dynamic pillar focus highlighting and color-coded score badges.
- **Storage Label Personnel Dropdown (`locLabelRespSelect`):** Integrated employee dropdown selection in `locationLabelModal` with auto-filling responsible person and live label preview updates.
- **FAQ & Knowledge Base Overhaul:** Rewrote FAQ knowledge base into 5 consolidated, structured accordion sections matching true `v74` capabilities.
- **5S Audit Rubric Score Explanations:** Clicking 5S Radar Chart points or history items resolves human-readable score explanations (`Ops.get5SRubricExplanation`) for every score (1–5) across all 5 pillars (`Sort`, `Set in Order`, `Shine`, `Standardize`, `Sustain`) from `S5_RUBRICS` instead of raw slash strings (e.g. `3/2/2/3/3` -> `3 - Лишнее есть, но сложено отдельно`). Highlighted pillar focus is styled dynamically.
- **Storage Label Personnel Dropdown (`locLabelRespSelect`):** Added `<select id="locLabelRespSelect">` in `locationLabelModal` populated from `Store.personnel`. Selecting an employee auto-fills `#locLabelResponsible` and triggers live sticker preview.
- **FAQ & Knowledge Base Overhaul (`FAQ_BODY`):** Rewrote Russian and English FAQ knowledge base from scratch, consolidating all system features into 5 clean, structured accordion sections matching true `v73` capabilities.
- **Eliminated `| Unknown` Postfix:** Refactored `Ops.workstationAndPostOf` and `Charts.computeCulture` to check `hasPost`. Single-part locations (e.g. `Charging Station`, `Main Store`) render as clean workstation names without trailing `| Unknown`.
- **High-Contrast Dark Theme Text & Badges:** Replaced dark-on-dark text in storage summary cards and shelf accordion headers with high-contrast explicit color tokens (`color: var(--text-main, #f8fafc)` and high-contrast badges `#ffffff` on `--danger`/`--primary`, `#000000` on `--warning`).
- **Bulletproof PWA Auto-Update:** Disabled background polling loops (`setInterval`, `visibilitychange`), enforced single-action clean update pipeline (`unregister` -> `caches.delete` -> `window.location.reload(true)`).
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
