// ============================================================================
// 5S Tool Command Center — Risk Index computation
// Groups active tools by station | post and derives a 0–100 risk index
// (higher = safer). Shared by the dashboard "Risk Index & Incidents" chart and
// the risk-detail modal so both always agree.
// ============================================================================

import { Store } from '../storage/store';
import { workstationAndPostOf } from '../operations/toolOps';
import { Tool } from '../types/inventory';

/** Bucket for tools whose station is not in the registry (Shadow Board, Tool Crib, …). */
export const STORAGE_BUCKET = 'Storage / Crib';

export interface RiskGroup {
  ws: string;
  post: string;
  label: string;
  tools: Tool[];
  overdue: number;
  maintenance: number;
  avgWear: number;
  /** 0–100 index; higher = lower risk. */
  score: number;
  program: string;
  persona: string;
  reasons: string;
}

/**
 * Compute one risk group per registered station | post. Tools that live outside
 * the registered stations are aggregated into a single `Storage / Crib` bucket
 * so the chart stays readable instead of spawning a point per free-text location.
 */
export function computeRiskGroups(): RiskGroup[] {
  const active = Store.activeTools();
  const registered = new Set(Store.workstations);
  const groups: Record<string, { ws: string; post: string; tools: Tool[] }> = {};

  active.forEach(t => {
    const loc = workstationAndPostOf(t);
    const inRegistry = registered.has(loc.ws);
    const ws = inRegistry ? loc.ws : STORAGE_BUCKET;
    const post = inRegistry ? loc.post : '';
    const key = `${ws} | ${post}`;
    if (!groups[key]) groups[key] = { ws, post, tools: [] };
    groups[key].tools.push(t);
  });

  return Object.values(groups).map(g => {
    const tools = g.tools;
    const overdue = tools.filter(t => t.status === 'Overdue').length;
    const maintenance = tools.filter(t => t.status === 'Maintenance').length;
    const avgWear = Math.round(tools.reduce((a, t) => a + Store.wearOf(t), 0) / tools.length) || 0;
    const score = Math.max(5, Math.min(100, Math.round(100 - overdue * 20 - maintenance * 10 - avgWear * 0.4)));

    const progs = [...new Set(tools.map(t => t.program || Store.wsProgram[g.ws] || ''))].filter(Boolean);
    const program = progs.length ? progs.join(', ') : 'N/A';

    const persons = [...new Set(tools.map(t => {
      if (t.assigneeId) {
        const emp = Store.getEmp(t.assigneeId);
        return emp ? emp.name : t.assigneeId;
      }
      return null;
    }).filter(Boolean))] as string[];
    const persona = persons.length ? persons.join(', ') : 'Unassigned / Team';

    const hasPost = g.post && g.post !== 'Unknown' && g.post !== g.ws;
    const label = hasPost ? `${g.ws} | ${g.post}` : g.ws;

    return {
      ws: g.ws,
      post: g.post,
      label,
      tools,
      overdue,
      maintenance,
      avgWear,
      score,
      program,
      persona,
      reasons: '',
    };
  });
}
