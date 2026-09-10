import { Audit5S, KaizenEntry } from '../types/audit';
import { S5_RUBRICS, WEAR_RETIRE_PCT } from '../config/constants';
import { Store } from '../storage/store';
import { nowISO } from '../utils/formatters';
import { getLanguage } from '../i18n';

export function get5SRubricExplanation(pillarIndex: number, scoreVal: number): string {
  if (!scoreVal || scoreVal < 1 || scoreVal > 5) return 'N/A';
  const r = S5_RUBRICS[pillarIndex];
  if (!r) return 'N/A';
  const lang = getLanguage();
  const list = lang === 'RU' ? r.ru : r.en;
  return list[scoreVal - 1] || 'N/A';
}

export async function submit5sAudit(
  zone: string,
  post: string,
  inspector: string,
  scores: Record<string, number>,
  notes: string = '',
  photoId?: string
): Promise<Audit5S> {
  const pillarValues = Object.values(scores);
  const totalScore = pillarValues.length
    ? Math.round((pillarValues.reduce((a, b) => a + b, 0) / (pillarValues.length * 5)) * 100)
    : 100;

  const auditId = 'aud5s_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const audit: Audit5S = {
    id: auditId,
    date: nowISO().split('T')[0],
    inspector,
    auditor: inspector,
    zone: post ? `${zone} / ${post}` : zone,
    ws: zone,
    post: post || '',
    scores,
    totalScore,
    notes,
    photoId,
  };

  if (!Array.isArray(Store.audits5s)) {
    Store.audits5s = [];
  }
  Store.audits5s.unshift(audit);

  const scoreSummary = S5_RUBRICS.map(r => scores[r.id] ?? '-').join('/');
  Store.log('5S_AUDIT', `${zone} | ${post} [${scoreSummary}] scored ${totalScore}% by ${inspector}`);
  await Store.save();

  return audit;
}

export const submit5SAudit = submit5sAudit;

export async function recordToolAudit(
  toolId: string,
  wearPct: number,
  inspector: string,
  notes: string = '',
  result: 'PASS' | 'FAIL' | 'FLAG' = 'PASS',
  photoId?: string
): Promise<boolean> {
  const tool = Store.getTool(toolId);
  if (!tool) return false;

  if (!Array.isArray(tool.audit_history)) {
    tool.audit_history = [];
  }

  tool.audit_history.push({
    date: nowISO().split('T')[0],
    inspector,
    wear_pct: wearPct,
    notes,
    result,
    photoId,
  });

  if (wearPct >= WEAR_RETIRE_PCT && result === 'FAIL') {
    tool.status = 'Decommissioned';
    Store.toolEvent(tool, `Decommissioned during audit: Wear at ${wearPct}%. Insp: ${inspector}`);
  } else if (result === 'FAIL' || result === 'FLAG') {
    tool.status = 'Maintenance';
    Store.toolEvent(tool, `Sent to service during audit: ${notes}. Insp: ${inspector}`);
  } else {
    Store.toolEvent(tool, `Audit PASS (Wear: ${wearPct}%). Insp: ${inspector}`);
  }

  Store.touch(tool);
  Store.log('TOOL_AUDIT', `${tool.id} - Wear: ${wearPct}% (${result})`);
  await Store.save();

  return true;
}

export async function submitKaizen(
  author: string,
  zone: string,
  problemEn: string,
  problemRu: string,
  solutionEn: string,
  solutionRu: string,
  photoBefore?: string,
  photoAfter?: string
): Promise<KaizenEntry> {
  const entry: KaizenEntry = {
    id: 'kz_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    date: nowISO().split('T')[0],
    author,
    zone,
    problemEn,
    problemRu,
    solutionEn,
    solutionRu,
    status: 'Proposed',
    photoBefore,
    photoAfter,
  };

  const kaizenList: KaizenEntry[] = Store.meta.kaizenEvents || [];
  kaizenList.unshift(entry);
  Store.meta.kaizenEvents = kaizenList;

  Store.log('KAIZEN_ADD', `${zone} by ${author}: ${problemEn}`);
  await Store.save();

  return entry;
}
