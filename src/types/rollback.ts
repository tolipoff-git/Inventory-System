// Snapshot taken by `Store.snapshot()` before a destructive registry cascade and
// restored by `Store.rollback()`. Extracted into its own type so both the store
// and the persistence layer describe the same shape instead of casting to `any`.
import { Tool } from './inventory';
import { Employee } from './personnel';
import { Audit5S } from './audit';
import { RegistryEvents } from './registry';
import { SopDocument } from './sop';

export interface RollbackSnapshot {
  ts: string;
  reason: string;
  workstations: string[];
  workposts: (string | { name: string; ws?: string | null })[];
  programs: string[];
  wsProgram: Record<string, string>;
  registryEvents: RegistryEvents;
  sops: SopDocument[];
  personnel: Employee[];
  tools: Tool[];
  audits5s: Audit5S[];
}
