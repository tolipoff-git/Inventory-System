import { Tool } from './inventory';
import { PurchaseOrder } from './procurement';
import { Employee } from './personnel';
import { AuditLogEntry } from './audit';

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'pending' | 'error';

export interface SyncPayload {
  tools: Tool[];
  procurementLog: PurchaseOrder[];
  personnel: Employee[];
  settings: Record<string, any>;
  auditLog: AuditLogEntry[];
  deviceId: string;
  updatedAt: string;
  version: number;
  room?: string;
}

export interface SyncResponse {
  success: boolean;
  payload?: SyncPayload;
  timestamp?: string;
  notFound?: boolean;
  error?: string;
}

export interface SyncPing {
  invSyncPing: true;
  room: string;
  deviceId: string;
  updatedAt: string;
}

export interface SyncPhoto {
  id: string;
  url: string;
  caption?: string;
  timestamp?: string;
  toolId?: string;
}
