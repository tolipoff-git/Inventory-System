import ExcelJS from 'exceljs';
import { downloadBuffer } from '../utils/dom';
import { datedName } from '../utils/formatters';

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
  ws: string;
  wp?: string;
  orderId?: string;
  date?: string;
}

export async function generateReq003Workbook(
  items: ProcureCartItem[],
  meta: Req003Metadata
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '5S Tool Command Center';
  workbook.lastModifiedBy = meta.initials || 'Inventory System';
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet('REQ-003 Expense Request', {
    views: [{ showGridLines: true }],
  });

  // Header styling
  sheet.columns = [
    { key: 'num', width: 6 },
    { key: 'name', width: 36 },
    { key: 'qty', width: 10 },
    { key: 'cost', width: 15 },
    { key: 'total', width: 16 },
    { key: 'reason', width: 30 },
    { key: 'link', width: 35 },
  ];

  // Title block
  sheet.mergeCells('A1:G1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = '5S TOOL COMMAND CENTER — EXPENSE REQUEST (REQ-003)';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0A192F' },
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 36;

  // Metadata rows
  sheet.getCell('A3').value = 'Request Date:';
  sheet.getCell('B3').value = meta.date || new Date().toISOString().split('T')[0];
  sheet.getCell('D3').value = 'Requester:';
  sheet.getCell('E3').value = meta.initials || 'N/A';

  sheet.getCell('A4').value = 'Workstation:';
  sheet.getCell('B4').value = meta.wp ? `${meta.ws} / ${meta.wp}` : meta.ws;
  sheet.getCell('D4').value = 'Order Ref:';
  sheet.getCell('E4').value = meta.orderId || 'PENDING';

  ['A3', 'D3', 'A4', 'D4'].forEach(addr => {
    sheet.getCell(addr).font = { bold: true, color: { argb: 'FF555555' } };
  });

  // Table Headers at Row 6
  const headerRow = sheet.getRow(6);
  headerRow.values = [
    '#',
    'Item Description / Part Number',
    'Qty',
    'Unit Cost ($)',
    'Total Cost ($)',
    'Reason / Justification',
    'Supplier / Web Link',
  ];
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A8A' },
  };
  headerRow.height = 24;

  // Populate data rows
  const startRow = 7;
  items.forEach((item, idx) => {
    const row = sheet.getRow(startRow + idx);
    row.values = [
      idx + 1,
      item.name,
      item.qty,
      item.cost,
      { formula: `C${startRow + idx}*D${startRow + idx}`, result: item.total },
      item.reason,
      item.link || '—',
    ];
    row.getCell(4).numFmt = '$#,##0.00';
    row.getCell(5).numFmt = '$#,##0.00';
    row.alignment = { vertical: 'middle' };
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
  });

  const lastDataRow = startRow + items.length - 1;
  const totalRowIndex = Math.max(lastDataRow + 2, 10);

  // Total summary row
  const totalRow = sheet.getRow(totalRowIndex);
  sheet.getCell(`D${totalRowIndex}`).value = 'GRAND TOTAL:';
  sheet.getCell(`D${totalRowIndex}`).font = { bold: true, size: 12 };
  sheet.getCell(`D${totalRowIndex}`).alignment = { horizontal: 'right' };

  const grandTotalCell = sheet.getCell(`E${totalRowIndex}`);
  grandTotalCell.value = {
    formula: `SUM(E${startRow}:E${lastDataRow})`,
    result: items.reduce((s, it) => s + it.total, 0),
  };
  grandTotalCell.font = { bold: true, size: 12, color: { argb: 'FF166534' } };
  grandTotalCell.numFmt = '$#,##0.00';
  totalRow.height = 24;

  // Signatures / Approvals
  const sigRowIdx = totalRowIndex + 3;
  sheet.getCell(`A${sigRowIdx}`).value = 'Department Lead Signature: ______________________';
  sheet.getCell(`E${sigRowIdx}`).value = 'Finance Approval: ______________________';
  sheet.getRow(sigRowIdx).font = { italic: true, size: 10 };

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export async function exportReq003Xlsx(
  items: ProcureCartItem[],
  meta: Req003Metadata
): Promise<void> {
  const buffer = await generateReq003Workbook(items, meta);
  const filename = datedName(`REQ003_Expense_Request_${meta.ws.replace(/[^a-zA-Z0-9_-]/g, '_')}`, 'xlsx');
  downloadBuffer(filename, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export const exportReq003Workbook = exportReq003Xlsx;
