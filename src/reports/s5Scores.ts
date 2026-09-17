// ============================================================================
// 5S pillar scoring — single source of truth for the 5S radar AND the 5S report.
// Previously this logic lived privately inside `ChartsView.compute5S()`, so the
// report could not reuse it. Extracted so both always agree.
// ============================================================================

import { Store } from '../storage/store';
import { S5_RUBRICS } from '../config/constants';
import { T } from '../i18n';
import { get5SRubricExplanation } from '../operations/auditOps';

export interface S5PillarScore {
  /** 0-based pillar index (Sort..Sustain). */
  index: number;
  /** Rubric id from `S5_RUBRICS` (sort / setOrder / …). */
  key: string;
  /** Translated pillar label. */
  pillar: string;
  /** 1..5 */
  score: number;
  /** Rich description for the radar tooltip (may contain `<br>`). */
  descHtml: string;
  /** Plain-text finding for report tables. */
  descText: string;
}

const PILLAR_KEYS = ['Sort', 'Set in Order', 'Shine', 'Standardize', 'Sustain'];

export function compute5SPillars(): S5PillarScore[] {
  const validAudits = (Store.audits5s || []).filter(a =>
    Store.workposts.some(p => p.name === a.post && p.ws === a.ws));

  if (validAudits.length) {
    const latest: Record<string, any> = {};
    validAudits.forEach(a => {
      const k = `${a.ws}|${a.post}`;
      if (!latest[k] || String(a.date) > String(latest[k].date)) latest[k] = a;
    });
    const posts = Object.values(latest);

    return PILLAR_KEYS.map((p, pi) => {
      const rid = S5_RUBRICS[pi].id;
      const ranked = [...posts].sort((a: any, b: any) => (b.scores[rid] || 0) - (a.scores[rid] || 0));
      const best: any = ranked[0];
      const worst: any = ranked[ranked.length - 1];
      const avg = posts.reduce((s, a: any) => s + (a.scores[rid] || 0), 0) / posts.length;
      const fmt = (a: any) => `${a.ws} | ${a.post}`;
      const bestExp = get5SRubricExplanation(pi, best.scores[rid]);
      const worstExp = get5SRubricExplanation(pi, worst.scores[rid]);

      const descHtml = posts.length > 1
        ? `${T('AUDIT_BEST')}: ${best.scores[rid]}/5 (${bestExp}) — ${fmt(best)}<br>${T('AUDIT_WORST')}: ${worst.scores[rid]}/5 (${worstExp}) — ${fmt(worst)}`
        : `${fmt(best)} — ${T('AUDIT_SCORE')}: ${best.scores[rid]}/5 (${bestExp})`;
      const descText = posts.length > 1
        ? `${T('AUDIT_BEST')}: ${best.scores[rid]}/5 (${bestExp}) — ${fmt(best)} · ${T('AUDIT_WORST')}: ${worst.scores[rid]}/5 (${worstExp}) — ${fmt(worst)}`
        : `${fmt(best)} — ${T('AUDIT_SCORE')}: ${best.scores[rid]}/5 (${bestExp})`;

      return {
        index: pi,
        key: rid,
        pillar: T(p),
        score: Math.max(1, Math.min(5, Math.round(avg))),
        descHtml,
        descText,
      };
    });
  }

  const active = Store.activeTools();
  if (!active.length) {
    return PILLAR_KEYS.map((p, pi) => ({
      index: pi,
      key: S5_RUBRICS[pi].id,
      pillar: T(p),
      score: 3,
      descHtml: T('No data yet.'),
      descText: T('No data yet.'),
    }));
  }

  const clamp = (r: number) => Math.max(1, Math.min(5, Math.round(1 + 4 * r)));
  const pct = (nn: number) => `${Math.round(nn * 100)}%`;
  const withLocation = active.filter(t => t.location && t.location !== 'Pending').length / active.length;
  const addressed = active.filter(t => t.assigneeId || (t.location && (t.location.includes('-') || Store.workstations.some(w => t.location.includes(w))))).length / active.length;
  const avgWear = active.reduce((a, t) => a + Store.wearOf(t), 0) / active.length;
  const standardized = active.filter(t => (t.sn || t.article) && t.category && t.spec && t.spec !== 'N/A').length / active.length;
  const compliant = active.filter(t => t.status !== 'Overdue').length / active.length;

  const derived: Array<{ score: number; text: string }> = [
    { score: clamp(withLocation), text: `${pct(withLocation)} ${T('tools have a defined place.')}` },
    { score: clamp(addressed), text: `${pct(addressed)} ${T('at address storage or assigned.')}` },
    { score: Math.max(1, Math.min(5, Math.round(5 - avgWear / 20))), text: `${T('Average wear')} ${Math.round(avgWear)}%.` },
    { score: clamp(standardized), text: `${pct(standardized)} ${T('have SN, category and spec.')}` },
    { score: clamp(compliant), text: `${pct(compliant)} ${T('not overdue.')}` },
  ];

  return PILLAR_KEYS.map((p, pi) => ({
    index: pi,
    key: S5_RUBRICS[pi].id,
    pillar: T(p),
    score: derived[pi].score,
    descHtml: derived[pi].text,
    descText: derived[pi].text,
  }));
}
