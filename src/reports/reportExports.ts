import ExcelJS from 'exceljs';
import { Store } from '../storage/store';
import { downloadBuffer, printHtml } from '../utils/dom';
import { datedName, fmtDate, esc } from '../utils/formatters';
import { Audit5S } from '../types/audit';
import { S5_RUBRICS } from '../config/constants';
import { T } from '../i18n';

export async function exportFullInventoryExcel(): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '5S Tool Command Center';
  workbook.created = new Date();
  workbook.modified = new Date();

  // 1. Active Tools Sheet
  const sheet1 = workbook.addWorksheet('Active Inventory', {
    views: [{ showGridLines: true }],
  });

  sheet1.columns = [
    { header: 'ID', key: 'id', width: 14 },
    { header: 'Tool Name', key: 'name', width: 38 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Location / Storage Address', key: 'location', width: 28 },
    { header: 'Qty', key: 'qty', width: 10 },
    { header: 'Unit Cost ($)', key: 'price', width: 14 },
    { header: 'Total Value ($)', key: 'totalValue', width: 16 },
    { header: 'Serial Number / Article', key: 'sn', width: 20 },
    { header: 'Assigned To', key: 'assignee', width: 24 },
    { header: 'Due Return', key: 'dueReturn', width: 14 },
    { header: 'Calibration Due', key: 'calDue', width: 16 },
    { header: 'Wear (%)', key: 'wear', width: 12 },
  ];

  // Header row styling
  const headerRow1 = sheet1.getRow(1);
  headerRow1.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow1.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' },
  };
  headerRow1.height = 24;

  const tools = Store.activeTools();
  tools.forEach((t, i) => {
    const row = sheet1.addRow({
      id: t.id,
      name: t.name,
      type: t.type,
      category: t.category,
      status: t.status,
      location: t.location || '—',
      qty: t.qty || 1,
      price: t.price || (t as any).cost || 0,
      totalValue: { formula: `G${i + 2}*H${i + 2}`, result: (t.qty || 1) * (t.price || (t as any).cost || 0) },
      sn: t.serialNumber || (t as any).sn || (t as any).article || '—',
      assignee: t.assigneeId ? Store.empName(t.assigneeId) : '—',
      dueReturn: t.dueReturn ? fmtDate(t.dueReturn) : '—',
      calDue: t.calDue ? fmtDate(t.calDue) : '—',
      wear: Store.wearOf(t),
    });

    row.getCell('price').numFmt = '$#,##0.00';
    row.getCell('totalValue').numFmt = '$#,##0.00';
    row.getCell('qty').alignment = { horizontal: 'center' };
    row.getCell('wear').alignment = { horizontal: 'center' };
    row.getCell('id').font = { bold: true };
  });

  // 2. Retired Tools Sheet
  const sheet2 = workbook.addWorksheet('Decommissioned Archive', {
    views: [{ showGridLines: true }],
  });

  sheet2.columns = [
    { header: 'ID', key: 'id', width: 14 },
    { header: 'Tool Name', key: 'name', width: 38 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Retired Date', key: 'retiredAt', width: 16 },
    { header: 'Inspector / By', key: 'retiredBy', width: 20 },
    { header: 'Reason', key: 'reason', width: 25 },
    { header: 'Final Wear (%)', key: 'wear', width: 16 },
    { header: 'Notes', key: 'notes', width: 35 },
  ];

  const headerRow2 = sheet2.getRow(1);
  headerRow2.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow2.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF7F1D1D' },
  };
  headerRow2.height = 24;

  const retired = Store.retiredTools();
  retired.forEach(t => {
    sheet2.addRow({
      id: t.id,
      name: t.name,
      category: t.category,
      retiredAt: (t as any).retiredAt || '—',
      retiredBy: (t as any).retiredBy || '—',
      reason: (t as any).retireReason || '—',
      wear: (t as any).retireWear || Store.wearOf(t),
      notes: (t as any).retireNotes || '—',
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = datedName('Full_5S_Tool_Inventory', 'xlsx');
  downloadBuffer(filename, buffer as ArrayBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export function print5sAuditCertificate(audit: Audit5S): void {
  const pillarRows = S5_RUBRICS.map((r, i) => {
    const score = audit.scores[r.id] || 0;
    return `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">${i + 1}S - ${T(r.key)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center; font-size: 16px; font-weight: bold; color: ${score >= 4 ? '#16a34a' : score >= 3 ? '#d97706' : '#dc2626'};">${score} / 5</td>
      </tr>
    `;
  }).join('');

  const html = `
    <div style="max-width: 700px; margin: 0 auto; padding: 40px 30px; font-family: sans-serif; color: #1e293b; line-height: 1.5;">
      <div style="text-align: center; border-bottom: 3px solid #00d2ff; padding-bottom: 20px; margin-bottom: 24px;">
        <h1 style="margin: 0; font-size: 24px; color: #0a0f1d; text-transform: uppercase; letter-spacing: 1px;">5S Workplace Audit Record</h1>
        <div style="font-size: 14px; color: #64748b; margin-top: 6px;">5S Tool Command Center · Continuous Improvement Record</div>
      </div>

      <div style="display: flex; justify-content: space-between; margin-bottom: 24px; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
        <div>
          <div><strong>Station / Post:</strong> ${esc(audit.zone)}</div>
          <div style="margin-top: 4px;"><strong>Audit Date:</strong> ${esc(audit.date)}</div>
        </div>
        <div style="text-align: right;">
          <div><strong>Auditor:</strong> ${esc(audit.inspector)}</div>
          <div style="margin-top: 4px;"><strong>Compliance Score:</strong> <span style="font-size: 18px; font-weight: bold; color: #0284c7;">${audit.totalScore}%</span></div>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background: #0f172a; color: #ffffff;">
            <th style="padding: 10px; text-align: left;">Pillar (Evaluation Criteria)</th>
            <th style="padding: 10px; text-align: center; width: 120px;">Score</th>
          </tr>
        </thead>
        <tbody>
          ${pillarRows}
        </tbody>
      </table>

      ${audit.notes ? `
        <div style="margin-bottom: 24px; padding: 14px; background: #f1f5f9; border-radius: 6px;">
          <strong>Auditor Observations / Corrective Actions:</strong>
          <p style="margin: 6px 0 0 0; color: #334155;">${esc(audit.notes)}</p>
        </div>
      ` : ''}

      <div style="display: flex; justify-content: space-between; margin-top: 40px; padding-top: 20px; border-top: 1px solid #cbd5e1; font-size: 13px;">
        <div>Inspector Signature: _______________________</div>
        <div>Area Owner Signature: _______________________</div>
      </div>
    </div>
  `;

  printHtml(html);
}
