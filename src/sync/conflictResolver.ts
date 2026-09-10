import { Tool } from '../types/inventory';
import { PurchaseOrder } from '../types/procurement';
import { Employee } from '../types/personnel';
import { AuditLogEntry } from '../types/audit';
import { SyncPayload } from '../types/sync';
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

    const localTime = new Date(le.updatedAt || 0).getTime();
    const remoteTime = new Date(re.updatedAt || 0).getTime();

    map.set(re.id, remoteTime >= localTime ? { ...re } : { ...le });
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

  return {
    ...localSettings,
    ...remoteSettings,
    workstations,
    programs,
    wsProgram,
    workposts,
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
