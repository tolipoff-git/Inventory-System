# PRINTING & LABEL GENERATION — QA / CODE AUDIT REPORT
Reference: `index.monolith.v97.html` (monolith v97, full-featured)
Modular source under `src/` audited:
- `src/labels/labelPrint.ts`
- `src/labels/qrGenerator.ts`
- `src/ui/components/Modals/LabelModal.ts`
- `src/ui/components/Modals/DetailModal.ts`
- `src/ui/components/Modals/SopModal.ts`
- `src/ui/components/Modals/OpsMenuModal.ts`
- `src/utils/dom.ts`
- `src/ui/styles/print.css`
- `src/storage/store.ts` (labelQueue)

Audit date: 2026-09-10 (system time)
Auditor mode: rigorous / evidence-first (line refs only where file present; missing features called out by name).

---

## SUMMARY — OVERALL VERDICT: FUNCTIONAL BUT SIGNIFICANTLY REDUCED
The modular TypeScript rebuild delivers the core label-print flow (open → select format → preview with QR → print via iframe) and uses the same `qrcode` library (`qrGenerator.ts`) rather than the inlined QRious 4.0.2 from the monolith. However, the modular implementation is a **subset** of v97's label/location/printing capabilities: batch modes, live preview updates for location labels, queue printing batch jobs, SOP/Detail print styling, and dark-mode cleanup are either missing or partially implemented.

---

## 1. TOOL LABELS (LabelModal.openToolLabel)

### 1.1 QR / Barcode generation — OK, with library swap
- `src/labels/qrGenerator.ts` (line 1) imports `qrcode` npm package; uses `QRCode.toCanvas` (line 8) and `QRCode.toDataURL` (line 23) with `margin: 1`, `errorCorrectionLevel: 'M'`. The monolith (line 9420+) uses the inlined `QRious` v4.0.2 (`new QRious(...)`). The QR image output (black #000 / white #fff) is functionally identical; no barcode (Code 39) generation exists in either file, so no regression there.
- `labelPrint.ts` `drawAllQrsInContainer()` (line 142) awaits `renderQrToCanvas()` for each `<canvas class="lbl-qr">` before printing. The monolith (line 9420+) renders QR synchronously inside the label module. The modular async approach is safe but introduces a potential race if the user triggers print before canvases resolve; no guard is visible.

### 1.2 Format selection — PARTIAL (formats present, but `STOCKS` mapping is inconsistent with UI)
- `labelPrint.ts` defines `STOCKS`: `avery5161`, `avery5163`, `avery5366`, `brady119`, `brady29`, `brady61`, `brady56`, `genA`, `genB`, `genC` (lines 14-55). Note: the reference uses names `avery5161`, `avery5163`, `avery5366`, `brady`, `genericA`, `genericB`, `genericC`. The modular code uses different keys (`brady` vs `brady119`, `genA` vs `genericA`).
- `labelPrint.ts` `printLabelsHtml` accepts `format: LabelFormat` (line 185), where `LabelFormat = 'avery5161' | 'avery5163' | 'avery5366' | 'brady' | 'genericA' | 'genericB' | 'genericC'` (line 176). However, `STOCKS` keys (`brady119`, `genA`, etc.) and the format union (`brady`, `genericA`) don't fully match — the format keys don't align with the stock definitions. If `printLabelsHtml` is called with `'brady'`, `STOCKS['brady']` is `undefined`; the fallback `STOCKS[stockKey] || { kind: 'sheet', w: 101.6, h: 25.4 }` (line 210) silently falls back to default sheet dimensions instead of Brady roll dimensions. **Bug: format-to-stock mapping broken for Brady and generic formats.**
- The `LabelModal` format `<select>` (line 78-86) offers: `avery5161`, `avery5163`, `avery5366`, `brady`, `genericA`, `genericB`, `genericC`. Good parity with the format union.

### 1.3 Live preview updates — MISSING (only initial render; no live re-render)
- `LabelModal.createPrintModalDOM()` (line 72) creates preview container `labelPreviewContainer`. The format select change listener (line 100-106) updates `this.selectedFormat` and calls `updatePreview(tool)`, which renders a static HTML string with a `<img>` from `generateQrDataUrl()` and text fields (line 119-145). However:
  - There is **no live preview for changing copies** (`labelCopiesInput`); no event listener binds to the copies input.
  - The preview uses `generateQrDataUrl()` (line 122) rather than live `QRCode.toCanvas()` rendering inside the preview container. This is acceptable but differs from the monolith's live canvas-based preview.
  - The preview image is a data-URL (`<img src="${qrUrl}" ...>`); it doesn't update any QR size/style based on format changes (format doesn't affect preview dimensions). The preview is static and the same for all formats.

### 1.4 "Print" triggers printHtml or window.print — OK, but with differences
- `executePrint()` (line 158) creates `Array(copies).fill(tool)`, calls `await printLabelsHtml(toolsToPrint, this.selectedFormat)`, then `closeToolLabel()`.
- `labelPrint.ts` `printLabelsHtml()` (line 187) creates a hidden container `sheet-mode`, renders cells, draws QR canvases, clones node (replacing canvas with `<img>` for print stability), writes an iframe with embedded styles (line 210-247), then calls `iframe.contentWindow?.print()` after timeout (line 250). This is a solid approach and avoids relying solely on `window.print()` on the visible DOM, which is an improvement over a naive `print()` call.
- `printHtml()` (`src/utils/dom.ts`, line 115) is NOT called by `executePrint()`; instead `printLabelsHtml()` handles its own printing. The SOP (`SopModal.ts` line 123) correctly uses `printHtml(body)`. The `DetailModal` `detPrintBtn` (line 79) opens `LabelModal.openToolLabel()` rather than printing a document; there is no document-level print of the full specification. See §4.

### 1.5 Print CSS / @media print — PARTIAL (label mode CSS exists; no dark-mode cleanup for label print)
- `src/ui/styles/print.css` defines `body.print-label-mode` rules (line 77-109): hides everything except `#printLabelModal.active`, strips borders, sets `background: white`, `color: black`. This addresses button clutter and dark backgrounds.
- However, the modular `printLabelsHtml()` writes its own inline `<style>` inside the iframe (line 229-234) rather than relying solely on the external `@media print`; it does set `body { background: white; color: black !important; -webkit-print-color-adjust: exact; }`. The `print-zone-mode` rules (line 112-146) are comprehensive for SOP/report printing.
- No `@media print` override for `.label-preview-box` hover states that change background to turquoise (`label-type-card:hover strong { color: var(--bg-color); }` in `print.css` line 56) — this could cause dark-text-on-dark-background artifacts if the hover CSS leaks into print. Not a critical bug, but a style leakage.

---

## 2. STORAGE LOCATION LABELS (LabelModal.openLocationLabels)

### 2.1 Dropdown population — PARTIAL (workstations only; missing racks, shelves, bins, personnel)
- `createLocationModalDOM()` (line 205-247) creates inputs for `locTypeSelect`, `locZoneSelect` (select), `locRackInput`, `locShelfInput`, `locBinInput`, `locRespInput`.
- `populateLocationForm()` (line 249-254) fills `locZoneSelect` from `Store.workstations` only. There are no dropdowns for racks, shelves, or bins populated from `Store.tools` address fields (as the monolith does with `popList('locRackList', racks)` etc., line 9470-9485). The rack/shelf/bin fields remain plain text inputs without `datalist` or `select` options.
- The monolith (line 9451-9506) also fills zone, rack, shelf, bin dropdowns (`locZoneList`, `locRackList`, etc.) from existing tool addresses and provides `suggestNextBin()` (line 9441). The modular code has none of these.
- Personnel dropdown (`locRespInput`) is a plain text input; the monolith provides `locLabelResponsible` text but also has `onRespSelectChange()` linking to a responsible-person selector (not fully visible in the snippet). At minimum, the modular version lacks any dropdown of `Store.personnel`.

### 2.2 Storage QR codes with formatted deep-link URLs — OK (format matches reference)
- `executeLocationPrint()` (line 256-293) constructs `code = LOC:${type}:${zone}:${rack}:${shelf}:${bin}:${resp}` (line 264) and passes it to `generateQrDataUrl(code)` (line 265). The deep-link format (`LOC:${ws}:${rack}:${shelf}:${bin}` in reference; `LOC:${type}:${zone}:${rack}:${shelf}:${bin}:${resp}` in modular) is slightly different but structurally sound. The `locationDeeplink()` in `qrGenerator.ts` (line 33) uses `?loc=` parameter matching the reference.

### 2.3 Batch location labels — MISSING
- The `createLocationModalDOM()` has only a single `Print` button (`#locModalPrintBtn`) that calls `executeLocationPrint()`; there is no `batch` scope selector (`locLabelScope` radio group), no `Batch Print` (`#btnLocBatch`), and no `Add to Queue` (`#btnLocQueue`) in the modular version. The monolith (line 2238-2304) provides single / batch scope with live preview and three footer buttons: Close, Batch Print (hidden by default), Add to Queue, Print.
- The modular version also lacks `Labels.renderLocationPreview()` (line 9509) and any live preview card (`locPreviewCard`). The preview is missing entirely; the user clicks Print without preview.

### 2.4 Batch location label HTML — DIFFERENT (simpler single-label output)
- The modular `executeLocationPrint()` outputs a single `<div>` (line 268-278) and calls `printHtml(html)`. The monolith (line 9509+) generates a multi-label batch preview with `scope` logic. The modular output is acceptable for a single label but doesn't support batch generation.

---

## 3. LABEL QUEUE (`Store.labelQueue`)

### 3.1 Queue exists in Store — OK
- `src/storage/store.ts` defines `labelQueue: string[] = []` (line 38) and methods: `addToLabelQueue()` (line 348), `removeFromLabelQueue()` (line 354), `toggleLabelQueue()` (line 360), `isInLabelQueue()` (line 365), `clearLabelQueue()` (line 370). Good parity with the reference's queue logic.

### 3.2 Queue batch printing — MISSING (no UI / no batch print function)
- There is no `printQueueLabels()` or `batch print queue` function in `labelPrint.ts`, `LabelModal.ts`, or any UI component. The monolith (line 2872-2875, `labelQueueBadge`) shows a badge and presumably a batch print action in the header/navigation that is not present in the modular files inspected.
- The `OpsMenuModal.ts` (line 88) opens `LabelModal.openLocationLabels()` for storage labels; there is no queue-related button. No `labelQueue` UI reference exists in any inspected file.
- The `DetailModal` (line 79) opens `LabelModal.openToolLabel()`; there is no "Add to Queue" button.

---

## 4. DOCUMENT PRINTING

### 4.1 SOP printing (`#sopModalPrintBtn`) — OK
- `SopModal.createSopModalDOM()` (line 58) creates `#sopModalPrintBtn`. Click handler (line 86-89): `const body = document.getElementById('sopModalBody')?.innerHTML; if (body) printHtml(body);`. This matches the reference behavior.
- The SOP content (`renderSopContent()`, line 93-134) includes `h4`, `p`, `strong`. The `printHtml()` (`src/utils/dom.ts` line 115) creates a hidden `#printZone`, applies `print-zone-mode`, calls `window.print()`, and cleans up after 2 seconds or `afterprint`. The `@media print` rules (`print.css` line 112-146) clean buttons and style `#printZone` with light typography (`font-family: 'Segoe UI'`, `font-size: 12px`, headings with `#1f6f6b` color, tables with borders). No dark-background artifacts are expected because `#printZone` explicitly sets `background: #fff; color: #111;`. Good.

### 4.2 DetailModal tool passport printing (`#detPrintBtn`) — REDUCED (only label, not full document)
- `DetailModal.createModalDOM()` (line 79): `#detPrintBtn` event listener (line 87-91) calls `Auth.doAction('Tool Crib Manager', () => LabelModal.openToolLabel(this.currentToolId!))`. This opens the **label preview modal**, not a full tool-specification print document. The reference monolith likely offers both label printing and a full-spec document print (the user request mentions "complete tool specifications and audit history"). The modular implementation does **not** print the full `detLifecycle`, audit history list (`detHistory`), photo gallery, or specification table as a document.
- There is no `printHtml()` call inside `DetailModal`. The `printHtml()` function exists (`src/utils/dom.ts` line 115) and would support full-spec printing if invoked with the full modal body, but `detPrintBtn` is wired exclusively to the label flow.

### 4.3 Print styles free of dark artifacts and button clutter — MOSTLY OK for SOP, NOT FULLY ADDRESSED for label/zone
- `print-zone-mode` (`print.css` line 97-146): hides everything except `#printZone`, sets white background, clean typography, hides overlay. Good.
- `print-label-mode` (`print.css` line 81-109): hides everything except `#printLabelModal.active`, strips borders/shadows, hides `.modal-header` and `.modal-footer`, hides `p`. Good for label-only printing.
- Potential issue: the `label-preview-box` hover (`label-type-card:hover strong { color: var(--bg-color); }`, line 56) could leak dark text onto a dark hover background if the print CSS is applied while hover is active. Minor.
- Potential issue: `printLabelsHtml()` creates its own iframe with inline `<style>` but does not include the full `print.css` file; it relies on `document.querySelectorAll('style, link[rel="stylesheet"]')` (line 212) to clone existing styles. If `print.css` is loaded as a `<link>` in the parent document, it will be cloned; if it's imported differently, it may not. The inline `body { ... }` covers the basics.

---

## 5. DISCREPANCIES / BUGS LIST (FILE + LINE REFERENCES)

### Critical / High
1. `src/labels/labelPrint.ts` lines 176, 210: `STOCKS` keys (`brady119`, `genA`, etc.) don't match `LabelFormat` union (`brady`, `genericA`). Print with `format='brady'` falls back to default sheet dimensions (`STOCKS['brady']` is `undefined`). Fix: align keys or map format→stock.
2. `src/labels/labelPrint.ts` line 187: `printLabelsHtml()` takes `format` parameter but the `STOCKS` lookup (line 210) uses the raw format key, not the mapped stock key. Same root cause as (1).
3. `src/ui/components/Modals/LabelModal.ts` line 205-247: `createLocationModalDOM()` has no `batch` scope selector (`locLabelScope`), no `Batch Print` button, and no live preview (`locPreviewCard`). The reference monolith (line 2238-2304) provides all three.
4. `src/ui/components/Modals/LabelModal.ts` line 249-254: `populateLocationForm()` only fills workstation dropdown; missing rack, shelf, bin dropdowns (`datalist`) and `suggestNextBin()` (reference line 9441-9484).
5. `src/storage/store.ts` line 348-375: `labelQueue` methods exist, but no UI consumes them. `OpsMenuModal.ts` has no queue-related button; `DetailModal` has no "Add to Queue" button; `labelPrint.ts` has no `printLabelsHtml` for queued IDs.

### Medium
6. `src/labels/labelPrint.ts` line 250: `setTimeout` of 400ms before `iframe.contentWindow?.print()` may not be sufficient for large label batches (many canvases). No retry or `afterprint` event is registered for the iframe print specifically (only cleanup after 1s).
7. `src/labels/labelPrint.ts` line 142: `drawAllQrsInContainer()` awaits each canvas sequentially but doesn't abort if `text` is missing or `canvas` has zero width; the fallback (line 20-30 in `qrGenerator.ts`) draws a black-outlined box with "QR ERROR", which is acceptable but should be mentioned.
8. `src/ui/components/Modals/LabelModal.ts` line 78-86: format `<select>` does not include `brady119` / `brady29` / `brady56` / `brady61` separately; the reference uses `brady` generically. Not a bug unless granular Brady sizes are required.
9. `src/ui/components/Modals/LabelModal.ts` line 119-145: preview uses `generateQrDataUrl()` (data URL image) rather than live canvas rendering; acceptable but different from reference.
10. `src/ui/components/Modals/DetailModal.ts` line 87-91: `#detPrintBtn` triggers label modal instead of full specification print. The reference likely supports full-document printing (user request explicitly asks for "complete tool specifications and audit history").

### Low / Style / Missing parity
11. `src/ui/styles/print.css` line 56: `.label-type-card:hover` color rules could leak into print if hover is active; add `@media print .label-type-card:hover { ... }` override.
12. `src/ui/components/Modals/LabelModal.ts` line 205+: no `locRespSelect` dropdown tied to `Store.personnel`; the reference links responsible person selection to `Store.workposts` or `Store.personnel`.
13. `src/labels/labelPrint.ts` line 176: `LabelFormat` is hard-coded; no dynamic format registration (acceptable for this scope).
14. `src/labels/qrGenerator.ts` line 8-18: `QRCode.toCanvas()` uses `margin: 1`, `errorCorrectionLevel: 'M'`. The reference (`QRious`, line 9420+) uses different default padding (`padding` option); output should still be scannable.

---

## 6. FEATURE MATRIX (MODULAR vs MONOLITH v97)

| Feature | Modular Status | Evidence (file:line) | Reference (v97 line) |
|---|---|---|---|
| QR generation (`qrcode`) | ✅ Implemented | `qrGenerator.ts:1` | `QRious` inlined `9419` |
| Barcode (Code 39) | ❌ None in either | — | — |
| Label format selection | ✅ Select present; mapping broken for Brady/generic | `LabelModal.ts:78` | `2236` |
| Live preview update (format change) | ⚠️ Updates but static image; no size/format effect | `LabelModal.ts:100` | `renderLocationPreview()` `9509` |
| Copies input | ✅ Present; no event listener | `LabelModal.ts:89` | `labelCopiesInput` `2285` |
| Print via iframe + embedded styles | ✅ Implemented (better than naive `print()`) | `labelPrint.ts:187` | `Labels.printLabels()` `2872` |
| `@media print` for labels (hide UI, white bg) | ✅ Present (`print-label-mode`) | `print.css:81` | `print-label-mode` `77` |
| `@media print` for SOP/report (`#printZone`) | ✅ Present (`print-zone-mode`) | `print.css:112` | `print-zone-mode` `97` |
| Storage location dropdowns (workstation/rack/shelf/bin) | ⚠️ Workstation only; others missing | `LabelModal.ts:249` | `popList` `9470` |
| Storage location batch mode | ❌ Missing | — | `locLabelScope` `2238` |
| Storage location live preview | ❌ Missing | — | `locPreviewCard` `2293` |
| Storage QR (`LOC:` format) | ✅ Implemented | `LabelModal.ts:264` | `locCode` `9537` |
| Label queue (`Store.labelQueue`) | ✅ Methods present | `store.ts:348` | `labelQueue` `2872` |
| Queue batch print | ❌ No UI / no print function | — | `labelQueueBadge` / batch action `2872` |
| SOP print (`#sopModalPrintBtn`) | ✅ Works via `printHtml()` | `SopModal.ts:86` | `sopModalPrintBtn` `10121` |
| DetailModal print (`#detPrintBtn`) | ⚠️ Opens label, not full spec | `DetailModal.ts:87` | Not directly visible in snippet |
| Full tool spec + audit history print | ❌ Not implemented | — | User request / expected feature |
| Dark-mode / button clutter cleanup | ✅ `print-zone-mode` clean; `print-label-mode` clean | `print.css:81`, `112` | `print-label-mode` `77` |

---

## 7. RECOMMENDATIONS (PRIORITIZED)
1. **Fix `STOCKS` / `LabelFormat` mismatch** (`labelPrint.ts:176, 210`) — map `format` to `STOCKS` keys or update `STOCKS` keys.
2. **Add batch scope and preview to `openLocationLabels()`** (`LabelModal.ts`) — add radio group (`single`/`batch`), `Batch Print` button, `locPreviewCard`, dropdowns for rack/shelf/bin (read from `Store.workstations` / `Store.tools`), `suggestNextBin()` reference, and `Add to Queue` button.
3. **Add queue batch print function** — `labelPrint.ts` needs `printQueueLabels()`; `OpsMenuModal.ts` needs a queue button; `DetailModal` needs "Add to Queue"; header needs `labelQueueBadge`.
4. **Add full specification print to `DetailModal`** (`DetailModal.ts`) — on `#detPrintBtn`, either open `LabelModal` (current) AND provide a second action, or change behavior to `printHtml()` with full `detLifecycle`, history, and photo gallery.
5. **Bind event to copies input** (`LabelModal.ts`) — update `executePrint()` to read current input value (already done) but also refresh preview on copy change (optional enhancement).
6. **Review hover CSS leakage** (`print.css`) — add `@media print .label-type-card:hover { ... }` override.

---

## 8. FILE REFERENCES (ALL INSPECTED)
- `src/labels/labelPrint.ts`
- `src/labels/qrGenerator.ts`
- `src/ui/components/Modals/LabelModal.ts`
- `src/ui/components/Modals/DetailModal.ts`
- `src/ui/components/Modals/SopModal.ts`
- `src/ui/components/Modals/OpsMenuModal.ts`
- `src/utils/dom.ts`
- `src/ui/styles/print.css`
- `src/storage/store.ts`
- `index.monolith.v97.html` (reference)
