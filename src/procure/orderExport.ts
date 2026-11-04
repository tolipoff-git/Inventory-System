import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import { T } from '../i18n';
import { ProcurementExportRow } from './orderExportRows';
import { downloadBuffer } from '../utils/dom';
import { datedName } from '../utils/formatters';
import { PROCUREMENT_PDF_FONT } from './fonts/dejavuSans';

function headers(): string[] {
  return ['PO #', 'Date', 'Requester', 'Workstation', 'Item', 'Qty', 'Recv', 'Unit $', 'Total $', 'Status', 'Reason:', 'Supplier Purchase Link:'].map(T);
}

export async function generateOrdersWorkbook(rows: ProcurementExportRow[]): Promise<ArrayBuffer> {
  if (!rows.length) throw new Error('NO_ITEMS_EXPORT');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(T('Purchase Orders').slice(0, 31));
  sheet.columns = [24, 16, 22, 30, 60, 10, 10, 16, 16, 18, 40, 55].map(width => ({ width }));
  const head = sheet.addRow(headers());
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163347' } };
  for (const row of rows) {
    const added = sheet.addRow([row.orderId, row.date, row.requester, row.station, row.name,
      row.qty, row.received, row.unitCost, row.amount, row.status, row.reason, row.link]);
    added.alignment = { vertical: 'top', wrapText: true };
    added.getCell(8).numFmt = added.getCell(9).numFmt = '$#,##0.00';
  }
  const total = sheet.addRow(['', '', '', '', T('Total'), '', '', '', rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0) / 100]);
  total.font = { bold: true };
  total.getCell(9).numFmt = '$#,##0.00';
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `L${rows.length + 1}` };
  sheet.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  sheet.pageSetup.printTitlesRow = '1:1';
  return await workbook.xlsx.writeBuffer() as ArrayBuffer;
}

/** Unicode text stays searchable; oversized rows split across pages without truncation. */
export function generateOrdersPdf(rows: ProcurementExportRow[]): ArrayBuffer {
  if (!rows.length) throw new Error('NO_ITEMS_EXPORT');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter', compress: true });
  doc.addFileToVFS('Procurement.ttf', PROCUREMENT_PDF_FONT);
  doc.addFont('Procurement.ttf', 'Procurement', 'normal');
  doc.setFont('Procurement');
  const margin = 13;
  const widths = [49, 119, 14, 17, 24, 30];
  const labels = [T('PO_EXPORT_META'), T('Item'), T('Qty'), T('Recv'), T('Unit $'), T('Total $')];
  const lineHeight = 4;
  const bottom = 197;
  let y = 0;
  const pageHeader = () => {
    doc.setFontSize(14);
    doc.text(T('Purchase Orders'), margin, 15);
    doc.setFontSize(8);
    doc.setFillColor(230, 237, 242);
    doc.rect(margin, 21, 253, 12, 'F');
    let x = margin;
    labels.forEach((label, i) => {
      doc.text(doc.splitTextToSize(label, widths[i] - 4) as string[], x + 2, 26);
      x += widths[i];
    });
    y = 34;
  };
  pageHeader();
  for (const row of rows) {
    const cells = [
      [row.orderId, row.date, row.requester, row.station, row.status].filter(Boolean).join('\n'),
      [row.name, row.reason, row.link].filter(Boolean).join('\n'),
      String(row.qty), String(row.received), row.unitCost.toFixed(2), row.amount.toFixed(2),
    ].map((value, i) => doc.splitTextToSize(value, widths[i] - 4) as string[]);
    const count = Math.max(...cells.map(c => c.length));
    let offset = 0;
    while (offset < count) {
      const capacity = Math.floor((bottom - y - 4) / lineHeight);
      if (capacity < 1) { doc.addPage(); pageHeader(); continue; }
      const take = Math.min(capacity, count - offset);
      const height = take * lineHeight + 4;
      let x = margin;
      doc.setDrawColor(200, 210, 218);
      cells.forEach((lines, i) => {
        doc.rect(x, y, widths[i], height);
        const part = lines.slice(offset, offset + take);
        if (part.length) doc.text(part, x + 2, y + 4);
        x += widths[i];
      });
      y += height;
      offset += take;
    }
  }
  if (y + 12 > bottom) { doc.addPage(); pageHeader(); }
  doc.setFontSize(10);
  const sum = rows.reduce((total, r) => total + Math.round(r.amount * 100), 0) / 100;
  doc.text(`${T('Total')}: $${sum.toFixed(2)}`, 266, y + 8, { align: 'right' });
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.text(`${page} / ${doc.getNumberOfPages()}`, 266, 207, { align: 'right' });
  }
  return doc.output('arraybuffer');
}

export async function exportPurchaseRows(rows: ProcurementExportRow[], format: 'xlsx' | 'pdf'): Promise<void> {
  const buffer = format === 'xlsx' ? await generateOrdersWorkbook(rows) : generateOrdersPdf(rows);
  downloadBuffer(datedName('Purchase_Orders', format), buffer,
    format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
}
