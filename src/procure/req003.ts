// ============================================================================
// REQ-003 Expense Request export.
//
// Produces the OFFICIAL corporate workbook (sheet "Form") by patching the
// embedded template cell-by-cell. The template is ZIP_STORED, so every other
// part of the file (styles, theme, "FSE Code" dropdown, formulas) is copied
// through untouched — the downloaded file is identical to
// REQ_Expense_Request_<date>.xlsx from the company template.
// ============================================================================

import { downloadBuffer } from '../utils/dom';
import { datedName } from '../utils/formatters';
import { Store } from '../storage/store';
import { REQ_TEMPLATE_B64 } from './req003Template';
import { ZipStore } from './zipStore';

export interface ProcureCartItem {
  name: string;
  qty: number;
  cost: number;
  total: number;
  reason: string;
  link?: string;
  toolId?: string | null;
}

export interface Req003Metadata {
  initials: string;
  ws?: string;
  wp?: string;
  orderId?: string;
  date?: string;
}

/** REQ-003 form holds rows 7..21 = 15 line items */
export const REQ003_MAX_ITEMS = 15;

/** Builds the filled REQ-003 workbook as a Uint8Array (ready to download). */
export function generateReq003Workbook(
  items: ProcureCartItem[],
  meta: Req003Metadata
): Uint8Array {
  if (items.length > REQ003_MAX_ITEMS) {
    throw new Error('REQ_LIMIT');
  }

  const entries = ZipStore.read(ZipStore.fromBase64(REQ_TEMPLATE_B64));
  const sheet = entries.find(e => e.name === 'xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('Template sheet1.xml not found');

  // Requestor: resolve initials to the employee's full name when known.
  const initials = (meta.initials || '').trim();
  const emp = Store.activePersonnel().find(p => p.initials &&
    initials && p.initials.toLowerCase() === initials.toLowerCase());
  const requestor = emp ? emp.name : (initials || 'N/A');

  let xml = ZipStore.text(sheet.data);
  xml = ZipStore.patchCell(xml, 'F3', requestor);

  // Line items -> rows 7, 8, 9... Row amounts and the grand total are computed
  // by the template formulas; cached values keep numbers visible without recalc.
  let grandTotal = 0;
  items.forEach((item, i) => {
    const row = 7 + i;
    xml = ZipStore.patchCell(xml, `B${row}`, item.link || item.toolId || 'N/A');
    xml = ZipStore.patchCell(xml, `C${row}`, item.name || 'N/A');
    xml = ZipStore.patchCell(xml, `D${row}`, item.qty, true);
    xml = ZipStore.patchCell(xml, `E${row}`, item.cost, true);
    xml = ZipStore.patchFormula(xml, `F${row}`, `D${row}*E${row}`, item.total);
    xml = ZipStore.patchCell(xml, `H${row}`, item.reason || '');
    grandTotal += item.total;
  });
  xml = ZipStore.patchFormula(xml, 'F23', 'SUM(F7:F22)', grandTotal.toFixed(2));

  sheet.data = ZipStore.encode(xml);
  return ZipStore.write(entries);
}

export function exportReq003Xlsx(
  items: ProcureCartItem[],
  meta: Req003Metadata
): void {
  const buffer = generateReq003Workbook(items, meta);
  const filename = datedName('REQ_Expense_Request', 'xlsx');
  downloadBuffer(filename, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export const exportReq003Workbook = exportReq003Xlsx;
