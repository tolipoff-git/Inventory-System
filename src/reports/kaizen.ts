// ============================================================================
// Kaizen recommendations — dynamic improvement advice derived from live data.
// Each recommendation carries a priority (1 act now · 2 plan · 3 sustain) and
// the role(s) that can act on it, so the 5S report can group advice by owner.
// Ported from the legacy monolith `Kaizen` module (screen + print blocks).
//
// Strings are kept as inline `{en, ru}` pairs — like the monolith — so every
// recommendation is guaranteed to exist in both languages.
// ============================================================================

import { Store } from '../storage/store';
import { CONFIG } from '../config/constants';
import { careOf } from '../operations/toolOps';
import { computeRiskGroups } from './riskIndex';
import { getLanguage } from '../i18n';
import { esc } from '../utils/formatters';

export type KaizenPriority = 1 | 2 | 3;
export type KaizenRole = 'Administrator' | 'Tool Crib Manager' | 'Operator';

export interface KaizenRecommendation {
  prio: KaizenPriority;
  roles: KaizenRole[];
  en: string;
  ru: string;
}

export const KAIZEN_PRIO: Record<KaizenPriority, { en: string; ru: string; color: string; printClass: string }> = {
  1: { en: 'Act now', ru: 'Немедленно', color: 'var(--danger)', printClass: 'pz-bad' },
  2: { en: 'Plan', ru: 'Запланировать', color: 'var(--warning)', printClass: 'pz-warn' },
  3: { en: 'Sustain', ru: 'Поддерживать', color: 'var(--success)', printClass: 'pz-ok' },
};

export const KAIZEN_ROLE_ORDER: KaizenRole[] = ['Administrator', 'Tool Crib Manager', 'Operator'];

export const KAIZEN_ROLE_RU: Record<KaizenRole, string> = {
  'Administrator': 'Администратор',
  'Tool Crib Manager': 'Мастер инструментальной',
  'Operator': 'Оператор',
};

const roleName = (role: KaizenRole): string => (getLanguage() === 'RU' ? KAIZEN_ROLE_RU[role] : role);
const pick = (r: KaizenRecommendation): string => (getLanguage() === 'RU' ? r.ru : r.en);

export function analyzeKaizen(): KaizenRecommendation[] {
  const active = Store.activeTools();
  const now = Date.now();
  const R: KaizenRecommendation[] = [];
  const add = (prio: KaizenPriority, roles: KaizenRole[], en: string, ru: string) => R.push({ prio, roles, en, ru });
  const ids = (list: Array<{ id: string }>, n = 3) => list.map(t => t.id).slice(0, n).join(', ') + (list.length > n ? '…' : '');

  // 1. Overdue returns
  const overdue = active.filter(t => t.status === 'Overdue');
  if (overdue.length) {
    add(1, ['Operator'],
      `${overdue.length} tool(s) are overdue — return them to the shadow board before end of shift; every overdue lowers your Care Score.`,
      `Просрочено инструментов: ${overdue.length} — верните их на теневую доску до конца смены; каждая просрочка снижает ваш Care Score.`);
    add(1, ['Tool Crib Manager'],
      `Recall overdue tools (${ids(overdue)}) within 24h via Employee Audit Profiles.`,
      `Изымите просроченный инструмент (${ids(overdue)}) в течение 24 ч через профили аудита сотрудников.`);
    if (overdue.length >= 3) add(2, ['Administrator'],
      `Systemic overdue problem (${overdue.length} tools) — review issue terms; consider shorter return deadlines for high-risk stations.`,
      `Системная проблема просрочек (${overdue.length} шт.) — пересмотрите условия выдачи; рассмотрите сокращение сроков для проблемных постов.`);
  }

  // 2. Calibration
  const calOver = active.filter(t => t.calDue && new Date(t.calDue).getTime() < now);
  const calSoon = active.filter(t => t.calDue && new Date(t.calDue).getTime() >= now
    && new Date(t.calDue).getTime() - now < CONFIG.CAL_WARNING_DAYS * CONFIG.DAY_MS);
  if (calOver.length) add(1, ['Tool Crib Manager'],
    `${calOver.length} instrument(s) past calibration due (${ids(calOver)}) — quarantine in the Calibration Lab until verified.`,
    `Просрочена калибровка у ${calOver.length} приборов (${ids(calOver)}) — изолируйте в лаборатории калибровки до поверки.`);
  if (calSoon.length) add(2, ['Tool Crib Manager'],
    `Calibration due within ${CONFIG.CAL_WARNING_DAYS} days for ${calSoon.length} tool(s) (${ids(calSoon)}) — schedule the lab visit now.`,
    `Калибровка в течение ${CONFIG.CAL_WARNING_DAYS} дней у ${calSoon.length} ед. (${ids(calSoon)}) — запланируйте поверку заранее.`);

  // 3. Wear & retirement
  const worn = active.filter(t => Store.wearOf(t) >= CONFIG.WEAR_RETIRE_PCT);
  const wearing = active.filter(t => { const w = Store.wearOf(t); return w >= CONFIG.WEAR_WARN_PCT && w < CONFIG.WEAR_RETIRE_PCT; });
  if (worn.length) add(1, ['Administrator'],
    `${worn.length} asset(s) above ${CONFIG.WEAR_RETIRE_PCT}% wear (${ids(worn)}) — approve decommission; replacements go via Expense Request.`,
    `Износ выше ${CONFIG.WEAR_RETIRE_PCT}% у ${worn.length} ед. (${ids(worn)}) — утвердите списание; замена оформляется через Expense Request.`);
  if (wearing.length >= 3) add(2, ['Tool Crib Manager'],
    `${wearing.length} tools in the yellow wear zone (>${CONFIG.WEAR_WARN_PCT}%) — plan a bulk replacement batch to avoid line stoppages.`,
    `${wearing.length} инструментов в жёлтой зоне износа (>${CONFIG.WEAR_WARN_PCT}%) — запланируйте партию замены, чтобы не остановить линию.`);

  // 4. Consumables: average wear & stock
  const cons = active.filter(t => t.type === 'Consumable');
  const byCat: Record<string, number[]> = {};
  cons.forEach(t => { (byCat[t.category] = byCat[t.category] || []).push(Store.wearOf(t)); });
  const hotCat = Object.entries(byCat).find(([, arr]) => arr.reduce((a, b) => a + b, 0) / arr.length > 60);
  if (hotCat) add(2, ['Tool Crib Manager'],
    `Average wear of "${hotCat[0]}" consumables exceeds 60% — schedule bulk replacement to minimize cam-out and scrap.`,
    `Средний износ расходки «${hotCat[0]}» выше 60% — запланируйте плановую замену партии против срыва шлицев и брака.`);
  const lowStock = cons.filter(t => (t.minQty || 0) > 0 && (t.qty || 1) <= (t.minQty || 0));
  if (lowStock.length) add(2, ['Administrator'],
    `Low stock on ${lowStock.length} consumable item(s) (${ids(lowStock)}) — approve a procurement request.`,
    `Низкий запас по ${lowStock.length} позициям расходки (${ids(lowStock)}) — утвердите заявку на закупку.`);

  // 5. Production culture by station/post
  const groups = computeRiskGroups();
  if (groups.length) {
    const worst = groups.reduce((a, b) => (a.score <= b.score ? a : b));
    if (worst.score < 70) {
      add(2, ['Administrator'],
        `"${worst.label}" has the weakest production culture (${worst.score}/100) — run a focused 5S audit and coach the shift lead.`,
        `На посту «${worst.label}» самая слабая культура производства (${worst.score}/100) — проведите точечный 5S-аудит и инструктаж старшего смены.`);
      add(3, ['Operator'],
        `Housekeeping at "${worst.label}" needs attention — keep tools on the shadow board and report damage immediately.`,
        `Порядок на посту «${worst.label}» требует внимания — возвращайте инструмент на теневую доску и сразу сообщайте о повреждениях.`);
    }
  }

  // 6. Personnel care score
  const lowCare = Store.personnel.filter(e => careOf(e).score < 75);
  if (lowCare.length) {
    const names = lowCare.map(e => e.name).slice(0, 2).join(', ') + (lowCare.length > 2 ? '…' : '');
    add(2, ['Administrator'],
      `${lowCare.length} employee(s) with Care Score below 75 (${names}) — arrange tool-handling refresher training.`,
      `У ${lowCare.length} сотрудников Care Score ниже 75 (${names}) — организуйте повторный инструктаж по обращению с инструментом.`);
    add(3, ['Operator'],
      'Grade returns honestly at the crib: a "Needs Maintenance" mark in time is cheaper than a broken tool and a quality incident.',
      'Честно отмечайте состояние при возврате: отметка «Needs Maintenance» вовремя дешевле, чем сломанный инструмент и инцидент качества.');
  }

  // 7. All clear
  if (!R.length) add(3, ['Administrator', 'Tool Crib Manager', 'Operator'],
    'No problems detected: compliance is high, no overdue or worn tools. Sustain the standard — keep the 5S rhythm.',
    'Проблем не выявлено: высокое соответствие, нет просрочек и износа. Поддерживайте стандарт и ритм 5S.');

  return R.sort((a, b) => a.prio - b.prio);
}

/** Screen block for the 5S modal — grouped by the role that can act. */
export function renderKaizenScreen(recs: KaizenRecommendation[]): string {
  const roles = KAIZEN_ROLE_ORDER.filter(role => recs.some(r => r.roles.includes(role)));
  return roles.map(role => {
    const items = recs.filter(r => r.roles.includes(role)).map(r => {
      const p = KAIZEN_PRIO[r.prio];
      const tag = getLanguage() === 'RU' ? p.ru : p.en;
      return `<li style="margin-bottom:7px; line-height:1.45;">
        <span style="color:${p.color}; font-weight:bold; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.5px;">[${esc(tag)}]</span>
        ${esc(pick(r))}</li>`;
    }).join('');
    return `<div style="margin-bottom:12px;">
      <div style="color:var(--primary-hover); font-weight:bold; border-left:3px solid var(--primary); padding-left:8px; margin-bottom:6px;">👤 ${esc(roleName(role))}</div>
      <ul style="margin:0 0 0 18px; padding:0; font-size:0.92rem;">${items}</ul></div>`;
  }).join('');
}

/** Print block (light `#printZone` form). */
export function renderKaizenPrint(recs: KaizenRecommendation[]): string {
  const roles = KAIZEN_ROLE_ORDER.filter(role => recs.some(r => r.roles.includes(role)));
  return roles.map(role => {
    const items = recs.filter(r => r.roles.includes(role)).map(r => {
      const p = KAIZEN_PRIO[r.prio];
      const tag = getLanguage() === 'RU' ? p.ru : p.en;
      return `<li><span class="${p.printClass}">[${esc(tag)}]</span> ${esc(pick(r))}</li>`;
    }).join('');
    return `<h3 style="margin:10px 0 4px; font-size:12px;">${esc(roleName(role))}</h3><ul style="margin-top:0;">${items}</ul>`;
  }).join('');
}
