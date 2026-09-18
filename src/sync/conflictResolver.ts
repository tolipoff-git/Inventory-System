import { Tool } from '../types/inventory';
import { PurchaseOrder } from '../types/procurement';
import { Employee } from '../types/personnel';
import { AuditLogEntry } from '../types/audit';
import { SyncPayload } from '../types/sync';
import { RegistryEvents, mergeRegistryEvents } from '../types/registry';
import { SopDocument } from '../types/sop';
import { AUDIT_LOG_LIMIT } from '../config/constants';

export function mergeTools(localTools: Tool[], remoteTools: Tool[]): Tool[] {
  const map = new Map<string, Tool>();

  // Add all local tools
  localTools.forEach(t => map.set(t.id, { ...t }));

  // Merge remote tools
  remoteTools.forEach(rt => {
    const lt = map.get(rt.id);
    if (!lt) {
      map.set(rt.id, { ...rt });
      return;
    }

    const localTime = new Date(lt.updatedAt || 0).getTime();
    const remoteTime = new Date(rt.updatedAt || 0).getTime();

    const winner = remoteTime >= localTime ? rt : lt;
    const merged: Tool = { ...winner };

    // Combine history without duplicates
    const histSet = new Set([...(lt.history || []), ...(rt.history || [])]);
    merged.history = Array.from(histSet);

    // Combine audit_history without duplicates
    const auditMap = new Map<string, any>();
    [...(lt.audit_history || []), ...(rt.audit_history || [])].forEach(a => {
      const key = `${a.date}_${a.inspector}_${a.result}`;
      auditMap.set(key, a);
    });
    merged.audit_history = Array.from(auditMap.values());

    map.set(rt.id, merged);
  });

  return Array.from(map.values());
}

export function mergeProcurement(
  localOrders: PurchaseOrder[],
  remoteOrders: PurchaseOrder[]
): PurchaseOrder[] {
  const map = new Map<string, PurchaseOrder>();

  localOrders.forEach(o => {
    const key = o.orderId || o.id || '';
    if (key) map.set(key, { ...o });
  });

  remoteOrders.forEach(ro => {
    const key = ro.orderId || ro.id || '';
    if (!key) return;
    const lo = map.get(key);
    if (!lo) {
      map.set(key, { ...ro });
      return;
    }

    const localTime = new Date(lo.updatedAt || lo.date || 0).getTime();
    const remoteTime = new Date(ro.updatedAt || ro.date || 0).getTime();

    map.set(key, remoteTime >= localTime ? { ...ro } : { ...lo });
  });

  return Array.from(map.values());
}

export function mergePersonnel(localEmp: Employee[], remoteEmp: Employee[]): Employee[] {
  const map = new Map<string, Employee>();

  localEmp.forEach(e => map.set(e.id, { ...e }));

  remoteEmp.forEach(re => {
    const le = map.get(re.id);
    if (!le) {
      map.set(re.id, { ...re });
      return;
    }

    // A removal is a tombstone, not an absence: the winner is still the newest
    // revision, but `deletedAt` counts as an edit so a delete cannot be undone
    // by a peer's stale copy. (`updatedAt` is stamped on delete as well; taking
    // the max keeps the rule safe for records written before that was true.)
    const localTime = revisionTime(le);
    const remoteTime = revisionTime(re);

    map.set(re.id, remoteTime >= localTime ? { ...re } : { ...le });
  });

  return Array.from(map.values());
}

/** Newest known revision timestamp of a personnel record (edit or tombstone). */
function revisionTime(e: Employee): number {
  return Math.max(
    new Date(e.updatedAt || 0).getTime() || 0,
    new Date(e.deletedAt || 0).getTime() || 0
  );
}

/**
 * Controlled documents are unioned by id with the newest revision winning.
 * They are never deleted (retiring one means `status: 'Obsolete'`), so no
 * tombstone is needed here.
 */
export function mergeSops(localSops: SopDocument[] = [], remoteSops: SopDocument[] = []): SopDocument[] {
  const map = new Map<string, SopDocument>();

  localSops.forEach(s => {
    if (s && s.id) map.set(s.id, { ...s });
  });

  remoteSops.forEach(rs => {
    if (!rs || !rs.id) return;
    const ls = map.get(rs.id);
    if (!ls) {
      map.set(rs.id, { ...rs });
      return;
    }
    const localTime = new Date(ls.updatedAt || 0).getTime() || 0;
    const remoteTime = new Date(rs.updatedAt || 0).getTime() || 0;
    map.set(rs.id, remoteTime >= localTime ? { ...rs } : { ...ls });
  });

  return Array.from(map.values());
}

export function mergeAuditLogs(localLogs: AuditLogEntry[], remoteLogs: AuditLogEntry[]): AuditLogEntry[] {
  const map = new Map<string, AuditLogEntry>();

  [...localLogs, ...remoteLogs].forEach(l => {
    const key = l.id || `${l.ts}_${l.action}_${l.details}`;
    map.set(key, l);
  });

  const merged = Array.from(map.values());
  merged.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  return merged.slice(0, AUDIT_LOG_LIMIT);
}

export function mergeSettings(localSettings: Record<string, any>, remoteSettings: Record<string, any>): Record<string, any> {
  const workstations = Array.from(new Set([
    ...(localSettings.workstations || []),
    ...(remoteSettings.workstations || []),
  ]));

  const programs = Array.from(new Set([
    ...(localSettings.programs || []),
    ...(remoteSettings.programs || []),
  ]));

  const wsProgram = {
    ...(localSettings.wsProgram || {}),
    ...(remoteSettings.wsProgram || {}),
  };

  const workpostSet = new Set<string>();
  const workposts: any[] = [];
  [...(localSettings.workposts || []), ...(remoteSettings.workposts || [])].forEach(p => {
    const name = typeof p === 'string' ? p : p.name;
    const ws = typeof p === 'string' ? null : p.ws;
    const key = `${name}@${ws}`;
    if (!workpostSet.has(key)) {
      workpostSet.add(key);
      workposts.push(typeof p === 'string' ? p : { name, ws });
    }
  });

  // 5S audits are append-only records: union by id, newest first.
  const auditMap = new Map<string, any>();
  [...(localSettings.audits5s || []), ...(remoteSettings.audits5s || [])].forEach(a => {
    const key = a && a.id ? a.id : `${a?.date}_${a?.ws}_${a?.post}`;
    if (!auditMap.has(key)) auditMap.set(key, a);
  });
  const audits5s = Array.from(auditMap.values())
    .sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')));

  // Registry entries are string arrays, so they need explicit tombstones to
  // keep a removal from being resurrected by the union below (see
  // `types/registry.ts`).
  const registryEvents: RegistryEvents = mergeRegistryEvents(
    localSettings.registryEvents || {},
    remoteSettings.registryEvents || {}
  );

  const sops = mergeSops(localSettings.sops, remoteSettings.sops);

  return {
    ...localSettings,
    ...remoteSettings,
    workstations,
    programs,
    wsProgram,
    workposts,
    audits5s,
    registryEvents,
    sops,
  };
}

export function mergeSyncPayloads(
  localPayload: SyncPayload,
  remotePayload: SyncPayload
): SyncPayload {
  return {
    tools: mergeTools(localPayload.tools, remotePayload.tools),
    procurementLog: mergeProcurement(localPayload.procurementLog, remotePayload.procurementLog),
    personnel: mergePersonnel(localPayload.personnel, remotePayload.personnel),
    settings: mergeSettings(localPayload.settings || {}, remotePayload.settings || {}),
    auditLog: mergeAuditLogs(localPayload.auditLog, remotePayload.auditLog),
    deviceId: localPayload.deviceId,
    updatedAt: new Date().toISOString(),
    version: Math.max(localPayload.version || 1, remotePayload.version || 1) + 1,
    room: localPayload.room || remotePayload.room,
  };
}
