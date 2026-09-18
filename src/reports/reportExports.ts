import ExcelJS from 'exceljs';
import { Store } from '../storage/store';
import { downloadBuffer, downloadText, printHtml, toast } from '../utils/dom';
import { datedName, fmtDate, fmtDateTime, esc, nowISO } from '../utils/formatters';
import { Audit5S } from '../types/audit';
import { S5_RUBRICS, WEAR_RETIRE_PCT, WEAR_WARN_PCT, TOOL_CLASSES } from '../config/constants';
import { Auth } from '../auth/authManager';
import { sha256Hex } from '../utils/crypto';
import { careOf } from '../operations/toolOps';
import { T } from '../i18n';

async function writeInventoryWorkbook(): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '5S Tool Command Center';
  workbook.created = new Date();
  workbook.modified = new Date();

  // Common style colors
  const C = {
    dark: 'FF1F2833', accent: 'FF45A29E', ok: 'FF00B894',
    warn: 'FFE0A000', bad: 'FFD0003C', zebra: 'FFF2F5F7'
  };
  const thin: any = { style: 'thin', color: { argb: 'FFB0B8C0' } };
  const border: any = { top: thin, bottom: thin, left: thin, right: thin };

  const styleHeader = (row: ExcelJS.Row) => row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 } as any;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.dark } };
    c.alignment = { vertical: 'middle' }; // type-cast applied via cell
    c.border = border;
  });

  const statusFill: Record<string, string> = {
    'Active': C.ok, 'Issued': C.warn, 'Backup': 'FF8C929A',
    'Maintenance': C.warn, 'Overdue': C.bad, 'Retired': C.bad
  };

  // --- 1. Compute serial / author / active / checksum ---
  const exportSerial = 'EXP-' + nowISO().replace(/[-:T]/g, '').slice(0, 14) + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();
  const author = (Auth.current && Auth.current.username) ? `${Auth.current.username} (${Auth.current.role})` : 'System Administrator';
  const active = Store.activeTools();
  const permTools = active.filter(t => t.type === 'Permanent');
  const consTools = active.filter(t => t.type === 'Consumable');
  const permQty = permTools.reduce((s, t) => s + (parseInt(String(t.qty)) || 1), 0);
  const consQty = consTools.reduce((s, t) => s + (parseInt(String(t.qty)) || 1), 0);
  const totalQty = permQty + consQty;

  const hashPayload = active.map(t => `${t.id}|${t.name}|${t.type}|${parseInt(String(t.qty)) || 1}|${t.status}|${t.sn || t.serialNumber || ''}`).join(';') + `::${exportSerial}::${author}`;
  const checksum = await sha256Hex(hashPayload);

  Store.log('INVENTORY_EXPORT', `Serial: ${exportSerial} | SKU: ${active.length} | Perm: ${permQty} pcs | Cons: ${consQty} pcs | Total: ${totalQty} units | Author: ${author} | SHA-256: ${checksum}`);

  // --- Helper: 5S dynamic scores ---
  const computeDynamic5S = () => {
    const audits = Store.audits5s || [];
    const pillars = ['sort', 'setOrder', 'shine', 'standardize', 'sustain'];
    const pillarLabels = ['Sort', 'Set in Order', 'Shine', 'Standardize', 'Sustain'];
    if (audits.length > 0) {
      const valid = audits.filter(a => Store.workposts.some(p => p.name === a.post && p.ws === a.ws));
      if (valid.length) {
        const latest: Record<string, Audit5S> = {};
        valid.forEach(a => {
          const k = `${a.ws}|${a.post}`;
          if (!latest[k] || String(a.date) > String(latest[k].date)) latest[k] = a;
        });
        const posts = Object.values(latest);
        return pillars.map((pid, i) => {
          const scores = posts.map(p => (p.scores && (p.scores as Record<string, number>)[pid]) ? (p.scores as Record<string, number>)[pid] : 0);
          const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 3;
          return { pillar: pillarLabels[i], score: Math.max(1, Math.min(5, Math.round(avg))) };
        });
      }
    }
    // Fallback dynamic from tool data
    const withLocation = active.filter(t => t.location && t.location !== 'Pending').length / Math.max(1, active.length);
    const addressed = active.filter(t => t.assigneeId || (t.location && (t.location.includes('-') || Store.workstations.some(w => t.location && t.location.includes(w))))).length / Math.max(1, active.length);
    const avgWear = active.reduce((a, t) => a + Store.wearOf(t), 0) / Math.max(1, active.length);
    const standardized = active.filter(t => (t.sn || t.serialNumber || t.article) && t.category && t.spec && t.spec !== 'N/A').length / Math.max(1, active.length);
    const compliant = active.filter(t => t.status !== 'Overdue').length / Math.max(1, active.length);
    const clamp = (r: number) => Math.max(1, Math.min(5, Math.round(1 + 4 * r)));
    return [
      { pillar: 'Sort', score: clamp(withLocation) },
      { pillar: 'Set in Order', score: clamp(addressed) },
      { pillar: 'Shine', score: Math.max(1, Math.min(5, Math.round(5 - avgWear / 20))) },
      { pillar: 'Standardize', score: clamp(standardized) },
      { pillar: 'Sustain', score: clamp(compliant) }
    ];
  };

  const fiveS = computeDynamic5S();

  // ================= SHEET 1: SUMMARY =================
  const sum = workbook.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  sum.columns = [{ width: 34 }, { width: 16 }, { width: 34 }, { width: 16 }, { width: 20 }];
  sum.mergeCells('A1:E1');
  const sTitle = sum.getCell('A1');
  sTitle.value = '5S — TOOLS INVENTORY SUMMARY';
  sTitle.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  sTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.dark } };
  sTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  sum.getRow(1).height = 32;

  sum.mergeCells('A2:E2');
  const sSub = sum.getCell('A2');
  sSub.value = `Export Serial: ${exportSerial}  |  Generated: ${fmtDateTime(new Date())}  |  Author: ${author}`;
  sSub.font = { italic: true, color: { argb: 'FF666666' } };

  // Key Metrics block
  sum.getCell('A4').value = 'KEY METRICS';
  sum.getCell('A4').font = { bold: true, size: 12, color: { argb: C.accent } };
  const kpis = [
    ['Total Assets', active.length],
    ['Available for Issue', active.filter(t => t.status === 'Active').length],
    ['Issued to Personnel', active.filter(t => t.status === 'Issued').length],
    ['Maintenance & Cal. Queue', active.filter(t => t.status === 'Maintenance').length],
    ['Overdue Alerts', active.filter(t => t.status === 'Overdue').length],
    ['Backup Stock', active.filter(t => t.status === 'Backup').length],
    ['Retired (Archive)', Store.retiredTools().length]
  ];
  kpis.forEach((k, i) => {
    const row = sum.getRow(5 + i);
    row.getCell(1).value = k[0] as string;
    row.getCell(2).value = k[1] as number;
    row.getCell(1).border = border;
    row.getCell(2).border = border;
    row.getCell(1).font = { bold: true };
    row.getCell(2).font = { bold: true };
    row.getCell(2).alignment = { horizontal: 'center' } as any;
    if (k[0] === 'Overdue Alerts' && (k[1] as number) > 0) {
      row.getCell(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.bad } };
    }
    if (i % 2) {
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
    }
  });

  // Workstation load block
  sum.getCell('C4').value = 'WORKSTATION LOAD';
  sum.getCell('C4').font = { bold: true, size: 12, color: { argb: C.accent } };
  Store.workstations.forEach((ws, i) => {
    const row = sum.getRow(5 + i);
    row.getCell(3).value = ws;
    row.getCell(4).value = active.filter(t => Store.workstationOf(t) === ws).length;
    row.getCell(3).border = border;
    row.getCell(3).font = { bold: true };
    row.getCell(4).font = { bold: true };
    row.getCell(4).alignment = { horizontal: 'center' } as any;
    row.getCell(4).border = border;
    if (i % 2) {
      row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
      row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
    }
  });

  // 5S audit scores
  sum.getCell('C12').value = '5S AUDIT SCORES';
  sum.getCell('C12').font = { bold: true, size: 12, color: { argb: C.accent } };
  fiveS.forEach((f, i) => {
    const row = sum.getRow(13 + i);
    row.getCell(3).value = f.pillar;
    row.getCell(4).value = `${f.score}/5`;
    row.getCell(3).border = border;
    row.getCell(3).font = { bold: true };
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(4).border = border;
    row.getCell(4).font = { bold: true, color: { argb: f.score >= 4 ? C.ok : f.score >= 3 ? C.warn : C.bad } };
  });

  // Tool Type Breakdown
  sum.getCell('A13').value = 'TOOL TYPE BREAKDOWN';
  sum.getCell('A13').font = { bold: true, size: 12, color: { argb: C.accent } };
  const typeBk = [
    ['Permanent Tooling', active.filter(t => t.type === 'Permanent').length],
    ['Consumable Stock', active.filter(t => t.type === 'Consumable').length]
  ];
  typeBk.forEach((k, i) => {
    const row = sum.getRow(14 + i);
    row.getCell(1).value = k[0] as string;
    row.getCell(2).value = k[1] as number;
    row.getCell(1).border = border; row.getCell(2).border = border;
    row.getCell(1).font = { bold: true };
    row.getCell(2).font = { bold: true };
    row.getCell(2).alignment = { horizontal: 'center' } as any;
    if (i % 2) {
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
    }
  });

  // Tool Class Group Breakdown
  sum.getCell('A17').value = 'TOOL CLASS GROUP BREAKDOWN';
  sum.getCell('A17').font = { bold: true, size: 12, color: { argb: C.accent } };
  const groupBk = [
    ['Mechanical Assembly (MECH)', active.filter(t => { const p = (t.id || '').split('-')[0]; const c = TOOL_CLASSES.find(x => x.p === p); return !!(c && c.group === 'MECH'); }).length],
    ['Electrical Assembly 24V/480V (EL)', active.filter(t => { const p = (t.id || '').split('-')[0]; const c = TOOL_CLASSES.find(x => x.p === p); return !!(c && c.group === 'EL'); }).length],
    ['Measurement & Inspection (MEAS)', active.filter(t => { const p = (t.id || '').split('-')[0]; const c = TOOL_CLASSES.find(x => x.p === p); return !!(c && c.group === 'MEAS'); }).length],
    ['Consumable Stock (CONS)', active.filter(t => { const p = (t.id || '').split('-')[0]; const c = TOOL_CLASSES.find(x => x.p === p); return !!(c && c.group === 'CONS'); }).length]
  ];
  groupBk.forEach((k, i) => {
    const row = sum.getRow(18 + i);
    row.getCell(1).value = k[0] as string;
    row.getCell(2).value = k[1] as number;
    row.getCell(1).border = border; row.getCell(2).border = border;
    row.getCell(1).font = { bold: true };
    row.getCell(2).font = { bold: true };
    row.getCell(2).alignment = { horizontal: 'center' } as any;
    if (i % 2) {
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
    }
  });

  // ID Prefix Legend
  let rIdx = 23;
  sum.mergeCells(`A${rIdx}:E${rIdx}`);
  const legHdr = sum.getCell(`A${rIdx}`);
  legHdr.value = 'ID PREFIX LEGEND';
  legHdr.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  legHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.dark } };
  legHdr.alignment = { horizontal: 'center', vertical: 'middle' };
  sum.getRow(rIdx).height = 20;
  rIdx++;

  const legHdrRow = sum.getRow(rIdx++);
  ['Prefix', 'Group', 'Name', 'Category'].forEach((h, i) => {
    const c = legHdrRow.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.dark } };
    c.border = border;
  });
  TOOL_CLASSES.forEach((cls, i) => {
    const row = sum.getRow(rIdx++);
    [cls.p, cls.group, `${cls.p} — ${cls.en}`, cls.cat].forEach((val, colIdx) => {
      const c = row.getCell(colIdx + 1);
      c.value = val;
      c.border = border;
      if (i % 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
    });
  });

  // Digital Integrity Seal
  rIdx++;
  sum.mergeCells(`A${rIdx}:E${rIdx}`);
  const stampHdr = sum.getCell(`A${rIdx}`);
  stampHdr.value = 'DIGITAL INTEGRITY SEAL & VERIFICATION STAMP';
  stampHdr.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  stampHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.dark } };
  stampHdr.alignment = { horizontal: 'center', vertical: 'middle' };
  sum.getRow(rIdx).height = 20;
  rIdx++;

  const stampRows = [
    ['Export Serial No', exportSerial],
    ['Verified Author / Generated By', author],
    ['Database Snapshot SHA-256', checksum],
    ['Total Unique Catalog Items (SKU)', `${active.length} SKU`],
    ['Permanent Tooling Stock', `${permQty} units (individual assets)`],
    ['Consumable Items in Stock', `${consQty} units (batch items in bins)`],
    ['Grand Total Physical Stock (Pieces)', `${totalQty} total units`],
    ['Tamper Protection Lock', 'LOCKED — Use System Audit Log to verify integrity'],
    ['Audit Security Status', 'OFFICIALLY VERIFIED & LOGGED']
  ];
  stampRows.forEach(([lbl, val], sIdx) => {
    sum.mergeCells(`B${rIdx}:E${rIdx}`);
    const row = sum.getRow(rIdx);
    const c1 = row.getCell(1);
    const c2 = row.getCell(2);
    c1.value = lbl;
    c1.font = { bold: true };
    c1.border = border;
    c2.value = val;
    c2.border = border;
    for (let col = 1; col <= 5; col++) row.getCell(col).border = border;
    if (sIdx % 2) {
      c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
      for (let col = 2; col <= 5; col++) row.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
    }
    if (lbl === 'Audit Security Status') c2.font = { bold: true, color: { argb: C.ok } };
    if (lbl === 'Tamper Protection Lock') c2.font = { bold: true, color: { argb: C.accent } };
    if (lbl === 'Database Snapshot SHA-256') {
      c2.font = { name: 'Courier New', size: 9.5, bold: true };
      c2.alignment = { vertical: 'middle', wrapText: true };
    }
    rIdx++;
  });

  // ================= SHEET 2: INVENTORY =================
  const inv = workbook.addWorksheet('Inventory');
  inv.columns = [
    { width: 10 }, { width: 46 }, { width: 14 }, { width: 12 },
    { width: 12 }, { width: 36 }, { width: 16 }, { width: 12 },
    { width: 13 }, { width: 26 }, { width: 16 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 9 }, { width: 14 }, { width: 18 }
  ];
  const headLabels = [
    'ID', 'Name', 'Qty in Stock', 'Min Qty', 'Max Qty', 'Class Name',
    'Category', 'Type', 'Status', 'Location', 'Holder', 'Issued Date',
    'Return Due', 'Cal. Due', 'Wear %', 'Serial No', 'Specification'
  ];
  const headRow = inv.addRow(headLabels);
  styleHeader(headRow);
  inv.getRow(1).height = 22;

  active.forEach((t, i) => {
    const wear = Store.wearOf(t);
    const prefix = (t.id || '').split('-')[0];
    const cls = TOOL_CLASSES.find(c => c.p === prefix);
    const className = cls ? `${cls.p} — ${cls.en}` : 'Custom ID';
    const minDisplay = t.type === 'Consumable' ? (t.minQty || 5) : '—';
    const maxDisplay = t.type === 'Consumable' ? ((t as any).maxQty || 20) : '—';

    const row = inv.addRow([
      t.id,
      t.name,
      parseInt(String(t.qty)) || 1,
      minDisplay,
      maxDisplay,
      className,
      t.category,
      t.type,
      t.status,
      t.location,
      t.assigneeId ? Store.empName(t.assigneeId) : '',
      t.assignedAt ? fmtDate(t.assignedAt) : '',
      t.dueReturn ? fmtDate(t.dueReturn) : '',
      t.calDue ? fmtDate(t.calDue) : '',
      wear,
      t.serialNumber || t.sn || '',
      t.spec || ''
    ]);
    row.eachCell(c => { c.border = border; });
    if (i % 2) row.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } });

    // Status fill colors
    const sc = row.getCell(9);
    sc.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sc.alignment = { horizontal: 'center' } as any;
    sc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusFill[t.status] || 'FF999999' } };

    // Wear % formatting
    const wc = row.getCell(15);
    wc.alignment = { horizontal: 'center' } as any;
    if (wear > WEAR_RETIRE_PCT) {
      wc.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      wc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.bad } };
    } else if (wear > WEAR_WARN_PCT) {
      wc.font = { bold: true };
      wc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE9A8' } };
    }

    // Overdue date red text
    [13, 14].forEach(col => {
      const cell = row.getCell(col);
      const v: string | null | undefined = col === 13 ? t.dueReturn : t.calDue;
      if (v && fmtDate(v) !== 'N/A') {
        const d = new Date(v);
        if (!isNaN(d.getTime()) && d.getTime() < Date.now()) {
          cell.font = { bold: true, color: { argb: C.bad } };
        }
      }
    });
  });
  inv.views = [{ state: 'frozen', ySplit: 1 }];
  inv.autoFilter = { from: 'A1', to: `Q${active.length + 1}` };

  // ================= SHEET 3: PERSONNEL =================
  const per = workbook.addWorksheet('Personnel');
  per.columns = [{ width: 10 }, { width: 24 }, { width: 10 }, { width: 10 }, { width: 20 }, { width: 20 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 10 }];
  const perHead = ['ID', 'Full Name', 'Initials', 'Badge No', 'Workstation', 'Post', 'Tools Held', 'Overdue', 'Max Wear %', 'Care Score', 'Grade'];
  const perHeadRow = per.addRow(perHead);
  styleHeader(perHeadRow);

  const personnel = Store.activePersonnel();
  personnel.forEach((p: any, i: number) => {
    const held = Store.tools.filter(t => t.assigneeId === p.id);
    const overdue = held.filter(t => t.status === 'Overdue').length;
    const wear = Math.max(0, ...held.map((t: any) => Store.wearOf(t)));
    const care = careOf(p);
    const row = per.addRow([
      p.id, p.name, p.initials || '', p.badge || '',
      p.ws || '', p.post || '', held.length, overdue, wear, care.score, care.grade
    ]);
    row.eachCell(c => { c.border = border; });
    if (i % 2) row.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } });

    if (overdue > 0) {
      const overdueCell = row.getCell(8);
      overdueCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      overdueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.bad } };
    }

    const careCell = row.getCell(11);
    const careColor = care.grade === 'A' ? C.ok : care.grade === 'B' ? C.accent : care.grade === 'C' ? C.warn : C.bad;
    careCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    careCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: careColor } };
    careCell.alignment = { horizontal: 'center' };
  });
  per.views = [{ state: 'frozen', ySplit: 1 }];
  per.autoFilter = { from: 'A1', to: `K${personnel.length + 1}` };

  // ================= SHEET 4: ARCHIVE =================
  const retired = Store.retiredTools();
  let arc: ExcelJS.Worksheet | null = null;
  if (retired.length) {
    arc = workbook.addWorksheet('Archive');
    arc.columns = [{ width: 10 }, { width: 42 }, { width: 14 }, { width: 14 }, { width: 20 }, { width: 10 }, { width: 12 }, { width: 44 }];
    const arcHeadLabels = ['ID', 'Name', 'Commissioned', 'Retired At', 'Reason', 'Wear %', 'Inspector', 'Notes'];
    const arcHeadRow = (arc as any).addRow(arcHeadLabels);
    styleHeader(arcHeadRow);

    retired.forEach((t: any, i: number) => {
      const row = (arc as any).addRow([
        t.id, t.name,
        t.commissioned_date || '',
        (t as any).retiredAt || '',
        (t as any).retireReason || '',
        (t as any).retireWear !== undefined ? (t as any).retireWear : Store.wearOf(t),
        (t as any).retiredBy || '',
        (t as any).retireNotes || ''
      ]);
      row.eachCell((c: any) => { c.border = border; });
      if (i % 2) row.eachCell((c: any) => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } });
    });
    arc.autoFilter = { from: 'A1', to: `H${retired.length + 1}` };
    arc.views = [{ state: 'frozen', ySplit: 1 }];
  }

  // ================= SHEET 5: AUDIT LOG =================
  const logSheet = workbook.addWorksheet('Audit Log');
  logSheet.columns = [{ width: 20 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 85 }];
  const logHeadLabels = ['Timestamp', 'User', 'Role', 'Action', 'Details'];
  const logHeadRow = logSheet.addRow(logHeadLabels);
  styleHeader(logHeadRow);

  [...Store.auditLog].reverse().forEach((e: any, i: number) => {
    const row = logSheet.addRow([
      (e.ts || '').replace('T', ' ').slice(0, 19),
      e.user || '',
      e.role || '',
      e.action || '',
      e.details || ''
    ]);
    row.eachCell((c: any) => {
      c.border = border;
      c.alignment = { vertical: 'middle', wrapText: true } as any;
    });
    if (i % 2) row.eachCell((c: any) => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } });
    const detCell = row.getCell(5);
    if (e.action === 'INVENTORY_EXPORT') {
      detCell.font = { name: 'Courier New', size: 9.5 };
    }
  });
  logSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // ================= SHEET PROTECTION =================
  const protectOpts: any = {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertRows: false,
    insertColumns: false,
    insertHyperlinks: false,
    deleteRows: false,
    deleteColumns: false,
    sort: true,
    autoFilter: true,
    pivotTables: false
  };
  const protectPw = checksum.slice(0, 16);

  await sum.protect(protectPw, protectOpts);
  await inv.protect(protectPw, protectOpts);
  await per.protect(protectPw, protectOpts);
  if (arc) await (arc as any).protect(protectPw, protectOpts);
  await logSheet.protect(protectPw, protectOpts);

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = datedName('5S_Tools_Inventory', 'xlsx');
  downloadBuffer(filename, buffer as ArrayBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/**
 * Exports the full inventory workbook. Never fails silently: on any ExcelJS or
 * quota error it falls back to the CSV export and tells the user why
 * (mirrors the monolith's XLSX_INIT_FAILED / XLSX_FAILED_CSV behaviour).
 */
export async function exportFullInventoryExcel(): Promise<void> {
  try {
    await writeInventoryWorkbook();
  } catch (err) {
    console.error('[reportExports:exportFullInventoryExcel] XLSX export failed, falling back to CSV:', err);
    const msg = err instanceof Error ? err.message : String(err);
    toast(T('XLSX_FAILED_CSV').replace('{msg}', msg), 'warning');
    exportInventoryCSV();
  }
}

export function exportInventoryCSV(): void {
  const q = (v: any) => '"' + String(v || '').replace(/"/g, '""') + '"';
  const header = 'ID,Name,Qty,Min Qty,Max Qty,Category,Type,Status,Location,Holder,Issued,Return Due,Cal Due,Wear %,SN,Spec\n';
  const body = Store.activeTools().map((t: any) => [
    q(t.id), q(t.name), parseInt(String(t.qty)) || 1, t.minQty || '', t.maxQty || '',
    q(t.category), q(t.type), q(t.status), q(t.location),
    q(t.assigneeId ? Store.empName(t.assigneeId) : ''),
    q(fmtDate(t.assignedAt)), q(fmtDate(t.dueReturn)), q(fmtDate(t.calDue)),
    Store.wearOf(t), q(t.serialNumber || t.sn || ''), q(t.spec || '')
  ].join(',')).join('\n');
  downloadText(datedName('5S_Tools_Inventory', 'csv'), header + body, 'text/csv');
}

export const exportInventoryXLSX = exportFullInventoryExcel;

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
