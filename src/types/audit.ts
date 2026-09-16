export type Pillar5S = '1S' | '2S' | '3S' | '4S' | '5S';

export interface Rubric5S {
  id: string;
  pillar: Pillar5S;
  en: string;
  ru: string;
  weight: number;
}

export interface Audit5S {
  id: string;
  date: string;
  inspector?: string;
  auditor?: string;
  zone?: string;
  ws?: string;
  post?: string;
  scores: Record<string, number>;
  totalScore?: number;
  notes?: string;
  photoId?: string;
}

export interface AuditLogEntry {
  id: string;
  ts: string;
  action: string;
  details: string;
  user: string;
  role?: string;
}

export type KaizenStatus = 'Proposed' | 'In Progress' | 'Implemented';

export interface KaizenEntry {
  id: string;
  date: string;
  author: string;
  zone: string;
  problemEn: string;
  problemRu: string;
  solutionEn: string;
  solutionRu: string;
  status: KaizenStatus;
  photoBefore?: string;
  photoAfter?: string;
}
