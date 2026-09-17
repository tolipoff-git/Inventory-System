// ============================================================================
// 5S Report — data model + screen/print renderers.
//
// Restores the rich report the legacy monolith produced (decommissioning
// statistics, procurement detail, workstation culture, Kaizen advice by role,
// signature block) and shares its computation with the dashboard:
//   • `compute5SPillars()` — same 5S scores as the radar
//   • `computeRiskGroups()` — same station|post risk index as the risk chart
//   • `analyzeKaizen()`    — role-targeted improvement advice
//
// Report prose is kept as inline bilingual `{en, ru}` pairs (as in the monolith)
// so every label is guaranteed to exist in both languages.
// ============================================================================

import { Store } from '../storage/store';
import { Auth } from '../auth/authManager';
import { getLanguage } from '../i18n';
import { esc, fmtDate, nowISO } from '../utils/formatters';
import { compute5SPillars, S5PillarScore } from './s5Scores';
import { computeRiskGroups, RiskGroup } from './riskIndex';
import { analyzeKaizen, renderKaizenScreen, renderKaizenPrint, KaizenRecommendation } from './kaizen';
import { Tool } from '../types/inventory';

const L = (en: string, ru: string): string => (getLanguage() === 'RU' ? ru : en);

// ---------------------------------------------------------------------------
// Decommissioning statistics
// ---------------------------------------------------------------------------

export interface RetireStat {
  tool: Tool;
  reason: string;
  ts: string;
}

export interface RetireStats {
  retired: Tool[];
  data: RetireStat[];
  reasonsMap: Record<string, number>;
  byCategory: Record<string, number>;
  freqReason: string;
}

export function retireStats(): RetireStats {
  const retired = Store.retiredTools();
  const data: RetireStat[] = retired.map(t => {
    let reason: string | null = (t as any).retireReason || null;
    let ts: string = (t as any).updatedAt || '';

    // Tool history: "<ts> | Decommissioned on <date> (Reason: X, Wear: N%, Insp: Y)"
    const evt = (t.history || []).find(h => /Decommissioned on|Decommissioned:|Retired on|Retired:/.test(h));
    if (evt) {
      ts = evt.split('|')[0].trim();
      if (!reason) {
        const rMatch = evt.match(/Reason:\s*([^,)]+)/);
        if (rMatch) reason = rMatch[1].trim();
        else if (evt.includes('Retired:')) reason = evt.split('Retired:')[1].trim();
        else if (evt.includes('Decommissioned:')) reason = evt.split('Decommissioned:')[1].trim();
      }
    }
    if (!reason) {
      const note = (t.audit_history || []).map(a => a.notes || '').find(n => n.startsWith('Decommissioned:'));
      if (note) reason = note.replace('Decommissioned:', '').split('.')[0].trim();
    }

    return { tool: t, reason: reason || L('Wear > 75% / Damaged', 'Износ > 75% / повреждение'), ts };
  }).sort((a, b) => b.ts.localeCompare(a.ts));

  const reasonsMap: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  let freqReason = 'N/A';
  let maxC = 0;
  data.forEach(d => {
    reasonsMap[d.reason] = (reasonsMap[d.reason] || 0) + 1;
    const cat = d.tool.category || L('General Tools', 'Прочий инструмент');
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    if (reasonsMap[d.reason] > maxC) { maxC = reasonsMap[d.reason]; freqReason = d.reason; }
  });

  return { retired, data, reasonsMap, byCategory, freqReason };
}

// ---------------------------------------------------------------------------
// Procurement detail — per position: last receipt, consumption basis, needed qty
// ---------------------------------------------------------------------------

export interface ProcRow {
  name: string;
  ids: string;
  lastIn: string;
  reason: string;
  need: number;
}

export function procurementDetail(): ProcRow[] {
  const rows: ProcRow[] = [];

  const lastOrder: Record<string, { date: string; reason?: string }> = {};
  (Store.procurementLog || []).forEach(l => {
    const items = l.items && l.items.length ? l.items : [{ name: l.name || '', reason: '' as string | undefined, qty: l.qty || 0 }];
    items.forEach(it => {
      const key = String(it.name || '').toLowerCase();
      if (!key) return;
      const date = String(l.date || l.orderDate || l.createdAt || '');
      if (!lastOrder[key] || date > lastOrder[key].date) lastOrder[key] = { date, reason: it.reason };
    });
  });

  const lastReceipt = (t: Tool): string | null => {
    let best: string | null = null;
    (t.history || []).forEach(h => {
      if (h.includes('Received order')) {
        const day = h.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(day) && (!best || day > best)) best = day;
      }
    });
    return best;
  };

  // 1. Consumables below minimum stock → top up to max
  Store.activeTools()
    .filter(t => t.type === 'Consumable' && (t.minQty || 0) > 0 && (t.qty || 0) <= (t.minQty || 0))
    .forEach(t => {
      const need = Math.max((t.maxQty || 0) - (t.qty || 0), (t.minQty || 0) - (t.qty || 0));
      const lo = lastOrder[String(t.name || '').toLowerCase()];
      rows.push({
        name: t.name,
        ids: t.id,
        lastIn: lastReceipt(t) || (lo ? lo.date : '—'),
        reason: L(
          `Below min stock (${t.qty || 0}/${t.minQty})` + (lo ? `; last order: ${lo.reason || '—'}` : ''),
          `Ниже минимума (${t.qty || 0}/${t.minQty})` + (lo ? `; последняя заявка: ${lo.reason || '—'}` : '')),
        need,
      });
    });

  // 2. Retired positions → replacement (grouped by name)
  const byName: Record<string, { ids: string[]; reasons: Record<string, true>; last: string }> = {};
  retireStats().data.forEach(d => {
    const k = d.tool.name || d.tool.category || L('Unknown', 'Неизвестно');
    const g = byName[k] = byName[k] || { ids: [], reasons: {}, last: '' };
    g.ids.push(d.tool.id);
    g.reasons[d.reason] = true;
    if (d.ts > g.last) g.last = d.ts;
  });
  Object.entries(byName).forEach(([name, g]) => {
    rows.push({
      name,
      ids: g.ids.join(', '),
      lastIn: '—',
      reason: L(
        `Retired ${g.ids.length} pcs (${Object.keys(g.reasons).join(', ')}) · last ${g.last || 'n/a'}`,
        `Списано ${g.ids.length} шт. (${Object.keys(g.reasons).join(', ')}) · последнее ${g.last || 'н/д'}`),
      need: g.ids.length,
    });
  });

  return rows;
}

export function procDetailTableHtml(): string {
  const rows = procurementDetail();
  if (!rows.length) return `<p>${esc(L('Inventory levels stable. No procurement needed.', 'Запасы стабильны. Закупка не требуется.'))}</p>`;
  const body = rows.map(r =>
    `<tr><td>${esc(r.name)}</td><td>${esc(r.ids)}</td><td>${esc(r.lastIn)}</td>` +
    `<td>${esc(r.reason)}</td><td style="text-align:center;"><b>${r.need}</b></td></tr>`).join('');
  return `<table><tr><th>${esc(L('Position', 'Позиция'))}</th><th>${esc(L('IDs', 'ID'))}</th>` +
    `<th>${esc(L('Last Receipt', 'Последний приход'))}</th>` +
    `<th>${esc(L('Consumption Basis', 'Основание расхода'))}</th>` +
    `<th>${esc(L('Needed Qty', 'Нужно, шт.'))}</th></tr>${body}</table>`;
}

// ---------------------------------------------------------------------------
// Report model
// ---------------------------------------------------------------------------

export interface S5ReportModel {
  activeCount: number;
  auditsCount: number;
  complianceRate: number;
  pillars: S5PillarScore[];
  statusCounts: Record<string, number>;
  groups: RiskGroup[];
  wsLoad: Array<{ ws: string; load: number; overdue: number; risk: 'High' | 'Medium' | 'Low' }>;
  overdue: Tool[];
  maintenance: Tool[];
  retire: RetireStats;
  procRows: ProcRow[];
  procurementAdvice: string[];
  kaizen: KaizenRecommendation[];
  generatedAt: string;
  author: string;
  authorRole: string;
}

const REPORT_STATUSES = ['Active', 'Issued', 'Backup', 'Maintenance', 'Overdue', 'Pending Delivery', 'Calibration'];

export function buildS5Report(): S5ReportModel {
  const active = Store.activeTools();
  const audits = Store.audits5s || [];

  const compliantCount = active.filter(t => ['Active', 'Issued', 'Backup'].includes(t.status)).length;
  const complianceRate = Math.round((compliantCount / Math.max(1, active.length)) * 100);

  const statusCounts: Record<string, number> = {};
  REPORT_STATUSES.forEach(s => { statusCounts[s] = active.filter(t => t.status === s).length; });

  // Workstation load & loss risk (registered workstations only)
  const wsLoad = Store.workstations.map(ws => {
    const wsTools = active.filter(t => Store.workstationOf(t) === ws);
    const overdue = wsTools.filter(t => t.status === 'Overdue').length;
    const risk: 'High' | 'Medium' | 'Low' = overdue > 0 ? 'High' : wsTools.length > 8 ? 'Medium' : 'Low';
    return { ws, load: wsTools.length, overdue, risk };
  });

  const retire = retireStats();

  // Simple procurement recommendations from retirement dynamics
  const procurementAdvice: string[] = [];
  Object.entries(retire.byCategory).forEach(([cat, n]) => {
    if (n >= 2) procurementAdvice.push(L(
      `Order replacement for ${cat} due to a high retirement rate.`,
      `Закажите замену для «${cat}» — высокий темп списаний.`));
  });
  if (!procurementAdvice.length && retire.data.length) {
    const topCat = Object.keys(retire.byCategory).sort((a, b) => retire.byCategory[b] - retire.byCategory[a])[0];
    if (topCat) procurementAdvice.push(L(
      `Consider ordering replacements for ${topCat} tools.`,
      `Рассмотрите заказ замены для инструмента «${topCat}».`));
  }

  return {
    activeCount: active.length,
    auditsCount: audits.length,
    complianceRate,
    pillars: compute5SPillars(),
    statusCounts,
    groups: computeRiskGroups(),
    wsLoad,
    overdue: active.filter(t => t.status === 'Overdue'),
    maintenance: active.filter(t => t.status === 'Maintenance'),
    retire,
    procRows: procurementDetail(),
    procurementAdvice,
    kaizen: analyzeKaizen(),
    generatedAt: nowISO(),
    author: Auth.getCurrentUser() || '—',
    authorRole: Auth.getCurrentRole() || '—',
  };
}

// ---------------------------------------------------------------------------
// Screen renderer (dark theme modal)
// ---------------------------------------------------------------------------

const riskColor = (risk: string): string => risk === 'High' ? 'var(--danger)' : risk === 'Medium' ? 'var(--warning)' : 'var(--success)';
const scoreColor = (score: number, max = 5): string =>
  score >= max * 0.8 ? 'var(--success)' : score >= max * 0.6 ? 'var(--warning)' : 'var(--danger)';

function kpiCard(value: string, label: string, color: string): string {
  return `<div style="flex:1; min-width:120px; background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:8px; padding:14px; text-align:center;">
    <div style="font-size:1.7rem; font-weight:bold; color:${color};">${value}</div>
    <div style="color:var(--text-muted); font-size:0.78rem; text-transform:uppercase;">${label}</div>
  </div>`;
}

function table(headers: string[], rows: string[]): string {
  return `<table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
    <thead><tr style="background:var(--border-dark);">${headers.map(h => `<th style="padding:8px 10px; text-align:left;">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody></table>`;
}

export function renderS5ReportScreen(m: S5ReportModel): string {
  const pillarCards = m.pillars.map(p => `
    <div style="background:rgba(255,255,255,0.03); padding:14px; border-radius:8px; border:1px solid var(--border);">
      <div style="font-size:0.85rem; color:var(--text-muted);">${esc(p.pillar)}</div>
      <div style="font-size:1.6rem; font-weight:bold; color:${scoreColor(p.score)};">${p.score} / 5</div>
      <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">${esc(p.descText)}</div>
    </div>`).join('');

  const statusRows = REPORT_STATUSES.map(s => `
    <tr>
      <td style="padding:6px 10px; border-bottom:1px solid var(--border); font-weight:bold;">${esc(s)}</td>
      <td style="padding:6px 10px; border-bottom:1px solid var(--border); text-align:center; color:${s === 'Overdue' ? 'var(--danger)' : s === 'Maintenance' ? 'var(--warning)' : 'inherit'};">${m.statusCounts[s] || 0}</td>
    </tr>`).join('') + `
    <tr>
      <td style="padding:6px 10px; border-bottom:1px solid var(--border); font-weight:bold;">${esc(L('Decommissioned (Retired)', 'Списано (архив)'))}</td>
      <td style="padding:6px 10px; border-bottom:1px solid var(--border); text-align:center;">${m.retire.retired.length}</td>
    </tr>`;

  const wsRows = m.wsLoad.map(d => `
    <tr>
      <td style="padding:6px 10px; border-bottom:1px solid var(--border);">${esc(d.ws)}</td>
      <td style="padding:6px 10px; border-bottom:1px solid var(--border); text-align:center;">${d.load}</td>
      <td style="padding:6px 10px; border-bottom:1px solid var(--border); text-align:center; color:${d.overdue > 0 ? 'var(--danger)' : 'inherit'};">${d.overdue}</td>
      <td style="padding:6px 10px; border-bottom:1px solid var(--border); text-align:center; font-weight:bold; color:${riskColor(d.risk)};">${esc(L(d.risk === 'High' ? 'High' : d.risk === 'Medium' ? 'Medium' : 'Low', d.risk === 'High' ? 'Высокий' : d.risk === 'Medium' ? 'Средний' : 'Низкий'))}</td>
    </tr>`).join('');

  const cultureRows = m.groups.map(g => `
    <tr>
      <td style="padding:6px 10px; border-bottom:1px solid var(--border);">${esc(g.label)}</td>
      <td style="padding:6px 10px; border-bottom:1px solid var(--border); text-align:center; font-weight:bold; color:${scoreColor(g.score, 100)};">${g.score}/100</td>
      <td style="padding:6px 10px; border-bottom:1px solid var(--border); font-size:0.85rem;">${esc(g.program)} · ${esc(g.persona)} · ${g.tools.length} ${esc(L('tools', 'шт.'))}</td>
    </tr>`).join('');

  const recentRetired = m.retire.data.slice(0, 5)
    .map(d => `<li><strong>${esc(d.tool.id)}</strong> (${esc(d.tool.name)}) — ${esc(d.reason)}</li>`).join('')
    || `<li>${esc(L('None', 'Нет'))}</li>`;

  const procAdvice = m.procurementAdvice.length
    ? m.procurementAdvice.map(r => `<li>${esc(r)}</li>`).join('')
    : `<li>${esc(L('Inventory levels stable. No immediate procurement needed.', 'Запасы стабильны. Срочная закупка не требуется.'))}</li>`;

  const overdueList = m.overdue.length
    ? m.overdue.map(t => `<li><b>${esc(t.id)}</b> — ${esc(t.name)} (${esc(L('Due', 'Срок'))}: ${esc(fmtDate(t.dueReturn))})</li>`).join('')
    : `<li>${esc(L('None', 'Нет'))}</li>`;
  const maintList = m.maintenance.length
    ? m.maintenance.map(t => `<li><b>${esc(t.id)}</b> — ${esc(t.name)}</li>`).join('')
    : `<li>${esc(L('None', 'Нет'))}</li>`;

  const h3 = (text: string) => `<h3 style="margin:20px 0 10px; color:var(--primary-hover);">${esc(text)}</h3>`;

  return `
  <div style="padding:20px; font-family:var(--font-main); color:var(--text-main);">
    <div style="text-align:center; border-bottom:2px solid var(--primary); padding-bottom:14px; margin-bottom:20px;">
      <h2 style="margin:0; text-transform:uppercase; letter-spacing:1px;">${esc(L('5S Production Engineering Audit Report', '5S отчёт производственного аудита'))}</h2>
      <div style="color:var(--text-muted); margin-top:6px;">
        ${esc(L('Audited assets', 'Активов'))}: ${m.activeCount} · ${esc(L('Audits logged', 'Аудитов'))}: ${m.auditsCount} ·
        ${esc(L('Generated', 'Создан'))}: ${esc(fmtDate(m.generatedAt))} · ${esc(m.author)} (${esc(m.authorRole)})
      </div>
    </div>

    <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:22px;">
      ${kpiCard(`${m.complianceRate}%`, L('5S Compliance Rate', 'Соответствие 5S'), m.complianceRate > 90 ? 'var(--success)' : 'var(--warning)')}
      ${kpiCard(String(m.activeCount), L('Total Audited Tools', 'Всего инструментов'), 'var(--primary-hover)')}
      ${kpiCard(String(m.overdue.length), L('Overdue', 'Просрочено'), m.overdue.length ? 'var(--danger)' : 'var(--success)')}
      ${kpiCard(String(m.maintenance.length), L('In Maintenance', 'В ремонте'), m.maintenance.length ? 'var(--warning)' : 'var(--success)')}
    </div>

    ${h3(L('5S Audit Scores', 'Оценки 5S'))}
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:12px; margin-bottom:20px;">${pillarCards}</div>

    ${h3(L('Status Breakdown', 'Разбивка по статусам'))}
    ${table([L('Status', 'Статус'), L('Count', 'Кол-во')], [statusRows])}

    ${h3(L('Decommissioning Statistics & Dynamics', 'Статистика и динамика списаний'))}
    <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:10px;">
      ${kpiCard(String(m.retire.retired.length), L('Total Retired', 'Всего списано'), 'var(--text-main)')}
      ${kpiCard(esc(m.retire.freqReason), L('Most Frequent Reason', 'Частая причина'), 'var(--primary-hover)')}
    </div>
    <div style="font-weight:bold; margin-bottom:6px;">${esc(L('Recently Decommissioned', 'Недавно списано'))}</div>
    <ul style="margin:0 0 20px 18px; padding:0; font-size:0.9rem;">${recentRetired}</ul>

    ${h3(L('Procurement Recommendations', 'Рекомендации по закупке'))}
    <ul style="margin:0 0 20px 18px; padding:0; line-height:1.6;">${procAdvice}</ul>

    ${h3(L('Procurement Detail', 'Детализация закупок'))}
    ${procDetailTableHtml()}

    ${h3(L('Workstation Tool Load & Loss Risk', 'Загрузка станций и риск потерь'))}
    ${table([L('Workstation', 'Станция'), L('Load', 'Загрузка'), L('Overdue', 'Просрочено'), L('Risk', 'Риск')], [wsRows])}

    ${h3(L('Workstation Production Culture', 'Культура производства по постам'))}
    ${table([L('Station', 'Пост'), L('Score', 'Оценка'), L('Details', 'Детали')], [cultureRows])}

    ${h3(L('Overdue & Maintenance Warnings', 'Предупреждения: просрочки и ремонт'))}
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
      <div style="background:rgba(255,0,0,0.05); padding:12px; border-radius:6px; border:1px solid var(--border);">
        <strong>${esc(L('Overdue', 'Просрочено'))} (${m.overdue.length})</strong>
        <ul style="margin:8px 0 0 16px; padding:0; font-size:0.9rem;">${overdueList}</ul>
      </div>
      <div style="background:rgba(255,165,0,0.05); padding:12px; border-radius:6px; border:1px solid var(--border);">
        <strong>${esc(L('Maintenance', 'В ремонте'))} (${m.maintenance.length})</strong>
        <ul style="margin:8px 0 0 16px; padding:0; font-size:0.9rem;">${maintList}</ul>
      </div>
    </div>

    ${h3(L('Kaizen Recommendations', 'Кайдзен-рекомендации'))}
    ${renderKaizenScreen(m.kaizen)}

    <p style="margin-top:24px; color:var(--text-muted); font-size:0.9rem;">
      ${esc(L(
        'This document certifies that the plant floor tooling and storage addresses have undergone rigorous 5S systematic review, maintaining visual control standards, shadow board fidelity, and calibrated accuracy.',
        'Настоящий документ подтверждает, что инструмент и адреса хранения прошли систематический 5S-обзор с поддержанием визуального контроля, соответствия теневых досок и точности калибровки.'))}
    </p>
  </div>`;
}

// ---------------------------------------------------------------------------
// Print renderer (light `#printZone` form)
// ---------------------------------------------------------------------------

export function renderS5ReportPrint(m: S5ReportModel): string {
  const pillars = m.pillars
    .map(p => `<tr><td>${esc(p.pillar)}</td><td>${p.score}/5</td><td>${esc(p.descText)}</td></tr>`).join('');

  const culture = m.groups.map(g => {
    return `<tr><td>${esc(g.label)}</td><td>${g.score}/100</td><td>${esc(g.program)} · ${esc(g.persona)} · ${g.tools.length}</td></tr>`;
  }).join('');

  const wsRows = m.wsLoad.map(d => {
    const cls = d.risk === 'High' ? 'pz-bad' : d.risk === 'Medium' ? 'pz-warn' : 'pz-ok';
    const label = L(d.risk === 'High' ? 'High' : d.risk === 'Medium' ? 'Medium' : 'Low',
      d.risk === 'High' ? 'Высокий' : d.risk === 'Medium' ? 'Средний' : 'Низкий');
    return `<tr><td>${esc(d.ws)}</td><td>${d.load}</td><td>${d.overdue}</td><td><span class="${cls}">${esc(label)}</span></td></tr>`;
  }).join('');

  const warnings = [...m.overdue, ...m.maintenance];
  const warnHtml = warnings.length
    ? warnings.map(w => `<li><strong>${esc(w.id)}</strong> (${esc(w.name)}) — ${esc(w.status)}</li>`).join('')
    : `<li>${esc(L('No current warnings. All clear.', 'Текущих предупреждений нет.'))}</li>`;

  const recentRetired = m.retire.data.slice(0, 5)
    .map(d => `<li><strong>${esc(d.tool.id)}</strong> (${esc(d.tool.name)}) — ${esc(d.reason)}</li>`).join('')
    || `<li>${esc(L('None', 'Нет'))}</li>`;

  const statusRows = REPORT_STATUSES.map(s => `<tr><td>${esc(s)}</td><td>${m.statusCounts[s] || 0}</td></tr>`).join('')
    + `<tr><td>${esc(L('Decommissioned (Retired)', 'Списано (архив)'))}</td><td>${m.retire.retired.length}</td></tr>`;

  return `
    <h1>${esc(L('5S Production Engineering Audit Report', '5S отчёт производственного аудита'))}</h1>
    <div class="pz-meta">${esc(L('Generated', 'Создан'))}: ${esc(fmtDate(m.generatedAt))} ·
      ${esc(L('By', 'Кто'))}: ${esc(m.author)} (${esc(m.authorRole)}) · 5S Tools Inventory</div>

    <div class="pz-kpis">
      <div class="pz-kpi"><b class="${m.complianceRate > 90 ? 'pz-ok' : 'pz-warn'}">${m.complianceRate}%</b>${esc(L('5S Compliance Rate', 'Соответствие 5S'))}</div>
      <div class="pz-kpi"><b>${m.activeCount}</b>${esc(L('Total Audited Tools', 'Всего инструментов'))}</div>
      <div class="pz-kpi"><b class="${m.overdue.length ? 'pz-bad' : 'pz-ok'}">${m.overdue.length}</b>${esc(L('Overdue', 'Просрочено'))}</div>
      <div class="pz-kpi"><b class="${m.maintenance.length ? 'pz-warn' : 'pz-ok'}">${m.maintenance.length}</b>${esc(L('In Maintenance', 'В ремонте'))}</div>
    </div>

    <h2>${esc(L('Status Breakdown', 'Разбивка по статусам'))}</h2>
    <table><tr><th>${esc(L('Status', 'Статус'))}</th><th>${esc(L('Count', 'Кол-во'))}</th></tr>${statusRows}</table>

    <h2>${esc(L('5S Pillars Assessment', 'Оценка столпов 5S'))}</h2>
    <table><tr><th>${esc(L('Pillar', 'Столп'))}</th><th>${esc(L('Score', 'Оценка'))}</th><th>${esc(L('Finding', 'Заключение'))}</th></tr>${pillars}</table>

    <h2>${esc(L('Workstation Production Culture', 'Культура производства по постам'))}</h2>
    <table><tr><th>${esc(L('Station', 'Пост'))}</th><th>${esc(L('Score', 'Оценка'))}</th><th>${esc(L('Details', 'Детали'))}</th></tr>${culture}</table>

    <h2>${esc(L('Workstation Tool Load & Loss Risk', 'Загрузка станций и риск потерь'))}</h2>
    <table><tr><th>${esc(L('Workstation', 'Станция'))}</th><th>${esc(L('Tool Load', 'Загрузка'))}</th><th>${esc(L('Overdue', 'Просрочено'))}</th><th>${esc(L('Risk Index', 'Индекс риска'))}</th></tr>${wsRows}</table>

    <h2>${esc(L('Overdue / Maintenance Warnings', 'Предупреждения: просрочки / ремонт'))}</h2>
    <ul>${warnHtml}</ul>

    <h2>${esc(L('Decommissioning Statistics', 'Статистика списаний'))}</h2>
    <p>${esc(L('Total retired', 'Всего списано'))}: <b>${m.retire.retired.length}</b> ·
       ${esc(L('Most frequent reason', 'Частая причина'))}: <b>${esc(m.retire.freqReason)}</b></p>
    <ul>${recentRetired}</ul>

    <h2>${esc(L('Procurement Detail', 'Детализация закупок'))}</h2>
    ${procDetailTableHtml()}

    <h2>${esc(L('Kaizen Recommendations', 'Кайдзен-рекомендации'))}</h2>
    ${renderKaizenPrint(m.kaizen)}

    <div class="pz-sign">
      <div>${esc(L('Prepared by (Tool Crib Manager)', 'Подготовил (мастер инструментальной)'))}</div>
      <div>${esc(L('Reviewed by (5S Lead)', 'Проверил (руководитель 5S)'))}</div>
    </div>`;
}
