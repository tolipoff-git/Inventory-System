# QA Audit Report — Reports & Excel Exports
Audit date: 2026-09-10 (per user directive)
Auditor: QA / Code Auditor (agent turn)
Reference: index.monolith.v97.html (v97 monolith)
Modules audited: src/reports/reportExports.ts, kpiCalculator.ts, radarChart.ts,
  src/ui/components/Modals/OpsMenuModal.ts, AuditLogModal.ts, AuditModal.ts,
  src/ui/components/Modals/OrderModal.ts (REQ003 export), src/procure/req003.ts

===============================================================================
1. exportInventoryXLSX (modular) vs exportInventoryXLSX (monolith v97)
===============================================================================

FILE: src/reports/reportExports.ts  (function exportFullInventoryExcel)

MISSING / DISCREPANCY — CRITICAL:
  - No cryptographic SHA-256 digital integrity stamp is computed. The monolith
    computes `checksum = await Utils.hashPw(hashPayload)` (line 11581) where
    hashPayload = active.map(...).join(';') + `::${exportSerial}::${author}`.
    The modular file has NO checksum computation, NO `exportSerial`, NO `author`
    variable, and NO `Store.log('INVENTORY_EXPORT', ...)` call.
  - The monolith writes the checksum into the sheet (Digital Integrity Seal block,
    lines 11745-11992), logs it to the audit log with serial / SKU / qty counts,
    and uses the first 16 chars (`checksum.slice(0, 16)`) as the sheet-protection
    password. NONE of this exists in the modular file.
  - The modular function is named `exportFullInventoryExcel()` (not the expected
    `exportInventoryXLSX()` the user referenced). It produces only 2 sheets
    ("Active Inventory" + "Decommissioned Archive"), whereas the monolith
    produces 5 sheets: Summary, Inventory, Personnel, Archive, Audit Log (plus
    conditional sheets). Auto-filters, summary KPI rows, workstation load, 5S
    audit scores, tool-class-group breakdown, ID-prefix legend, digital stamp,
    and sheet protection are ALL absent.

FILE: src/reports/reportExports.ts  (columns / styling check — present but minimal)
  Line 26-40: Columns declared (ID, Tool Name, Type, Category, Status, Location,
    Qty, Unit Cost, Total Value, Serial No, Assigned To, Due Return, Cal Due,
    Wear). Headers styled (bold white text, dark bg, height 24). Per-row styling:
    numFmt on price/totalValue ($#,##0.00), qty/wear centered, id bold.
  Line 48: `totalValue` formula uses `G*i+2 * H*i+2`. Note: column mapping
    (qty=G, price=H in row definition) — the formula references the correct
    columns given the column array ordering.
  MISSING: Auto-filter (`sheet.autoFilter`), frozen header (`sheet.views`),
    sheet protection (`sheet.protect(...)`), summary rows, KPI blocks.

===============================================================================
2. generate5SReport (modular) vs monolith Reports.generate5S()
===============================================================================

FILE: src/reports/reportExports.ts  (function print5sAuditCertificate) — present
  Computes pillar rows from `audit.scores[r.id]`, renders HTML for print,
  uses `T(r.key)` for i18n keys, includes signature lines, color-codes scores.

FILE: src/ui/components/Modals/AuditModal.ts  (report modal DOM / render)
  MISSING / DISCREPANCY — MAJOR:
  - `createReportModalDOM()` (line ~245) creates a modal with a print button
    (`#report5sPrintBtn`) wired to `printHtml(content)` from the innerHTML of
    `#report5sContent`. This satisfies "print button wired" at a basic level.
  - `renderReport()` (line ~270) uses HARD-CODED pillar scores (4.2, 4.5, 4.0,
    4.6, 4.4) and a static HTML template. It does NOT call `calculateKPIs()`,
    does NOT compute post-by-post 5S scores from `Store.audits5s`, and does NOT
    render a radar chart (no `renderRadarSvg()` call). The monolith renders
    a full 5S audit certificate with KPI blocks, status breakdown table,
    pillar assessment table, workstation production culture table, load & loss
    risk table, overdue/maintenance warnings, decommissioning statistics,
    procurement detail, and Kaizen recommendations. The modular version is a
    static placeholder.
  - `openReport()` exists and opens the modal. The OpsMenuModal button
    `#ops5sReportBtn` calls `AuditModal.openReport()` — correctly wired.
  - NO `generate5SReport()` function exists in the modular reports module.
    The user asked about `generate5SReport`; it is absent from the file list.
    Only `print5sAuditCertificate()` exists.

FILE: src/reports/kpiCalculator.ts — present, correct logic
  `calculateKPIs()` computes total/active/issued/backup/maintenance/overdue,
  availability rate (`(active+backup)/total`), average wear, total valuation,
  low stock count (consumable qty <= minQty), orders pending count from
  `Store.procurementLog`. Category/workstation load computed correctly.
  Used via import (e.g. in Charts or reports). No discrepancy.

FILE: src/reports/radarChart.ts — present, renders radar/donut/bar SVG
  `renderRadarSvg()` creates background rings, spokes, polygon, dots with
  `onClick`, and labels. `renderDonutSvg()` builds donut chart with legend.
  `renderBarSvg()` builds vertical bar chart with labels. All accept click
  handlers. Not called by `AuditModal.renderReport()` (see above) — that is
  a missing integration, not a bug in the chart module itself.

===============================================================================
3. exportREQ003XLSX (modular) vs monolith ProcureCart.exportXLSX()
===============================================================================

FILE: src/procure/req003.ts — function `exportReq003Xlsx()` present
  Uses `generateReq003Workbook()` to create an ExcelJS workbook titled
  "REQ-003 Expense Request" with columns # / Item Description / Qty / Unit Cost /
  Total Cost / Reason / Supplier Link. Rows 7+ contain items; row 6 is header.
  Formulas: total column uses `C*D` formula per row; grand total uses SUM formula.
  Signature rows are added at `sigRowIdx = totalRowIndex + 3`. Metadata rows
  (date, requester, workstation/order ref) at rows 3-4. All matches the user
  requirement: "inserts items into rows 7, 8, 9 of the requisition template with
  formulas". The file download is triggered via `downloadBuffer()` with MIME
  type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

FILE: src/ui/components/Modals/OrderModal.ts — button wired
  Line 245: `procureExcelBtn?.addEventListener('click', () => this.exportExcel())`
  `exportExcel()` (line ~390) calls `await exportReq003Workbook(...)` (imported
  from `../../../procure/req003`) and passes the cart items with meta `{ ws, wp,
  initials, date }`. Correctly wired. The button label is `Download Expense
  Request (.xlsx)` (`T('Download Expense Request (.xlsx)')` implied by the
  button text in the DOM).

===============================================================================
4. exportAuditLogXLSX / exportAuditLogCSV
===============================================================================

FILE: src/ui/components/Modals/AuditLogModal.ts
  - `exportCsv()` (line 125) is present: builds CSV string with header
    `Timestamp,User,Action,Details`, escapes quotes, calls `downloadText()`.
  - `exportAuditLogXLSX()` is NOT implemented. Only CSV is available. The
    user asked to verify XLSX export; it does not exist.
  - The button `#exportAuditLogCsvBtn` (line ~95) is wired to `this.exportCsv()`.
    The search input (`#auditLogSearch`) is wired to `this.renderAuditLog(query)`.
    Both are wired correctly.

===============================================================================
5. Button wiring verification (OpsMenuModal + AuditLogModal)
===============================================================================

FILE: src/ui/components/Modals/OpsMenuModal.ts
  Line 35-72: All 8 buttons wired:
    `#opsQuickScanBtn`  -> `ScannerModal.open()`
    `#ops5sReportBtn`  -> `AuditModal.openReport()`
    `#opsExportXlsxBtn` -> `await exportFullInventoryExcel()`
    `#opsProcureBtn`    -> `OrderModal.openProcure()`
    `#opsOrdersBtn`     -> `OrderModal.openList()`
    `#opsPostAuditBtn`  -> `AuditModal.openPostAudit()`
    `#opsStorageLabelsBtn` -> `LabelModal.openLocationLabels()`
    `#opsUpdatePwaBtn`  -> `window.location.reload()`
  No missing buttons. All event bindings use `.addEventListener('click', ...)`.

FILE: src/ui/components/Modals/AuditLogModal.ts
  Line 95: `#exportAuditLogCsvBtn` -> `this.exportCsv()` (correct)
  Line 101-106: `#auditLogSearch` -> input listener -> `this.renderAuditLog(query)`
  Line 108-113: `#auditLogFooterCloseBtn` -> `this.closeAuditLog()`
  Archive modal (`#archiveModalId`) has close buttons wired; restore buttons
  wired via querySelectorAll in `renderArchive()`.

===============================================================================
6. Additional observations (non-export, referenced by user request)
===============================================================================

FILE: src/reports/reportExports.ts — missing imports / unused
  `ExcelJS` imported but used. `Store` used. `downloadBuffer` / `printHtml`
  used. `datedName` / `fmtDate` / `esc` used. `Audit5S` type imported but only
  used in `print5sAuditCertificate()` parameter type. `S5_RUBRICS` used in
  pillar rendering. `T` (i18n) used.
  No `generate5SReport()` function. No `reportExports` module exports a 5S
  report generator (only `print5sAuditCertificate`).

FILE: src/reports/kpiCalculator.ts — no SHA, no export logic. Correct by design.
FILE: src/reports/radarChart.ts — SVG rendering only. No sheet/export logic.
  Correct by design.

===============================================================================
7. Critical defects (exact file / line references)
===============================================================================

DEFECT A — MISSING SHA-256 / DIGITAL STAMP / SHEET LOCK
  File: src/reports/reportExports.ts
  Function: exportFullInventoryExcel()
  Lines: 17-90 (entire function body)
  Issue: No `checksum` variable; no `hashPayload`; no `Store.log('INVENTORY_EXPORT', ...)`;
         no `workbook.protect()`; no `sum.protect()`; no digital integrity seal cell;
         no serial number generation (`EXP-...`). The monolith requires all of these.

DEFECT B — MISSING 5S REPORT GENERATOR
  File: src/reports/reportExports.ts
  Function: generate5SReport() — NOT FOUND (absent from file and module exports).
  The monolith defines `Reports.generate5S()` which produces a multi-section HTML
  report (KPI cards, status table, pillar table, workstation culture, load/risk,
  warnings, decommission stats, procurement, Kaizen recommendations). The modular
  `AuditModal.renderReport()` uses static hard-coded values instead.

DEFECT C — MISSING EXPORTAUDITLOGXLSX
  File: src/ui/components/Modals/AuditLogModal.ts
  Function: exportAuditLogXLSX() — NOT FOUND.
  Only `exportAuditLogCSV()` exists.

DEFECT D — REPORT MODAL USES HARD-CODED DATA
  File: src/ui/components/Modals/AuditModal.ts
  Lines: 270-310 (renderReport inner HTML)
  Hard-coded pillar scores: 4.2, 4.5, 4.0, 4.6, 4.4.
  No `calculateKPIs()` integration; no `Store.audits5s` processing; no `Charts`
  or `Reports.generate5S()` call; no radar chart embedding.

DEFECT E — MODULAR EXPORT FUNCTION NAME MISMATCH
  User referenced `exportInventoryXLSX`. The modular function is
  `exportFullInventoryExcel()` (line 15). The OpsMenuModal button calls the
  correct name, so this is only a naming inconsistency vs the user's spec,
  not a broken wire.

===============================================================================
8. Verified working features (evidence-based)
===============================================================================

- ExcelJS import and workbook creation: WORKING (line 19-21)
- Active inventory columns + header styling: WORKING (line 24-42)
- Per-row styling (numFmt, alignment, bold id): WORKING (line 54-62)
- Retired archive sheet + header styling: WORKING (line 67-88)
- Download trigger via downloadBuffer: WORKING (line 90-92)
- 5S audit print HTML (print5sAuditCertificate): WORKING (line 95-167)
- KPI calculator: WORKING (kpiCalculator.ts complete)
- Radar/donut/bar SVG renderers: WORKING (radarChart.ts complete)
- REQ-003 workbook generation (generateReq003Workbook): WORKING
  (req003.ts lines 28-146)
- REQ-003 XLSX download trigger: WORKING (req003.ts export function)
- OrderModal button `procureExcelBtn` -> exportExcel() -> exportReq003Workbook():
  WORKING (OrderModal.ts lines 245 + 390-405)
- AuditLogModal CSV export (`exportCsv`): WORKING (line 125-141)
- AuditLogModal search filter (`renderAuditLog(query)`): WORKING (line 70-89)
- OpsMenuModal all 8 buttons wired: VERIFIED (lines 35-72)
- AuditModal openReport / closeReport / createReportModalDOM: WORKING
  (lines 1-267, with the hard-coded data caveat above)
