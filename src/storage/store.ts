import { Tool } from '../types/inventory';
import { PurchaseOrder } from '../types/procurement';
import { Employee, SystemUser } from '../types/personnel';
import { AuditLogEntry, Audit5S } from '../types/audit';
import { AppDB, DBState } from './indexedDb';
import { SEED_USERS, SEED_WORKSTATIONS, SEED_TOOLS } from './seedData';
import { CONFIG } from '../config/constants';
import { nowISO, d } from '../utils/formatters';

export interface WorkpostItem {
  name: string;
  ws: string | null;
}

export type StoreSubscriber = (state: DBState) => void;

class StoreManager {
  private _activeTools: Tool[] | null = null;
  private _subscribers: Set<StoreSubscriber> = new Set();
  private _dbChannel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('inv_db_sync') : null;
  private _rollbackSnap: any = null;

  public users: SystemUser[] = [];
  public workstations: string[] = [];
  public workposts: WorkpostItem[] = [];
  public personnel: Employee[] = [];
  public tools: Tool[] = [];
  public labelQueue: string[] = [];
  public programs: string[] = [];
  public wsProgram: Record<string, string> = {};
  public auditLog: AuditLogEntry[] = [];
  public procurementLog: PurchaseOrder[] = [];
  public audits5s: Audit5S[] = [];
  public meta: Record<string, any> = { schemaVersion: CONFIG.SCHEMA_VERSION };

  constructor() {
    if (this._dbChannel) {
      this._dbChannel.onmessage = (event) => {
        if (event.data?.type === 'db_saved') {
          this.load().catch(err => console.error('Failed to reload from BroadcastChannel event', err));
        }
      };
    }
  }

  public subscribe(cb: StoreSubscriber): () => void {
    this._subscribers.add(cb);
    return () => this._subscribers.delete(cb);
  }

  public notify(): void {
    this._activeTools = null;
    const snap = this.getStateSnapshot();
    this._subscribers.forEach(cb => {
      try {
        cb(snap);
      } catch (err) {
        console.error('Store subscriber error:', err);
      }
    });
  }

  public getStateSnapshot(): DBState {
    return {
      tools: this.tools,
      personnel: this.personnel,
      users: this.users,
      auditLog: this.auditLog,
      procurementLog: this.procurementLog,
      workstations: this.workstations,
      workposts: this.workposts.map(p => (typeof p === 'string' ? p : p.name)),
      programs: this.programs,
      wsProgram: this.wsProgram,
      audits5s: this.audits5s,
      meta: this.meta,
      labelQueue: this.labelQueue,
      rollback: this._rollbackSnap,
    };
  }

  public async init(): Promise<void> {
    await AppDB.migrateFromLocalStorage();
    await this.load();
  }

  public async load(): Promise<void> {
    const data = await AppDB.loadAll();
    this.applyLoadedData(data);
    this.migrate();
    this.recomputeStatuses();
    this.notify();
  }

  public applyLoadedData(data: Partial<DBState>): void {
    this.tools = Array.isArray(data.tools) && data.tools.length ? data.tools : [...SEED_TOOLS];
    this.personnel = Array.isArray(data.personnel) ? data.personnel : [];
    this.users = Array.isArray(data.users) && data.users.length ? data.users : [...SEED_USERS];
    this.auditLog = Array.isArray(data.auditLog) ? data.auditLog : [];
    this.procurementLog = Array.isArray(data.procurementLog) ? data.procurementLog : [];
    this.workstations = Array.isArray(data.workstations) && data.workstations.length ? data.workstations : [...SEED_WORKSTATIONS];
    
    // Normalize workposts
    if (Array.isArray(data.workposts)) {
      this.workposts = data.workposts.map((p: any) =>
        typeof p === 'string' ? { name: p, ws: null } : { name: p.name, ws: p.ws || null }
      );
    } else {
      this.workposts = [];
    }

    this.programs = Array.isArray(data.programs) ? data.programs : [];
    this.wsProgram = data.wsProgram && typeof data.wsProgram === 'object' ? data.wsProgram : {};
    this.audits5s = Array.isArray(data.audits5s) ? data.audits5s : [];
    this.meta = data.meta && typeof data.meta === 'object' ? data.meta : { schemaVersion: CONFIG.SCHEMA_VERSION };
    this.labelQueue = Array.isArray(data.labelQueue) ? data.labelQueue : [];
    this._rollbackSnap = data.rollback || null;
  }

  public async save(): Promise<void> {
    this._activeTools = null;
    if (this.auditLog.length > CONFIG.AUDIT_LOG_LIMIT) {
      this.auditLog = this.auditLog.slice(-CONFIG.AUDIT_LOG_LIMIT);
    }

    const state: Partial<DBState> = {
      tools: this.tools,
      personnel: this.personnel,
      users: this.users,
      auditLog: this.auditLog,
      procurementLog: this.procurementLog,
      workstations: this.workstations,
      workposts: this.workposts.map(p => p.name),
      programs: this.programs,
      wsProgram: this.wsProgram,
      audits5s: this.audits5s,
      meta: this.meta,
      labelQueue: this.labelQueue,
      rollback: this._rollbackSnap,
    };

    await AppDB.saveAll(state);
    if (this._dbChannel) {
      this._dbChannel.postMessage({ type: 'db_saved', ts: Date.now() });
    }
    this.notify();
  }

  public log(action: string, details: string = '', user: string = 'operator'): void {
    this.auditLog.unshift({
      id: 'aud_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      ts: nowISO(),
      action,
      details: String(details),
      user,
    });
    if (this.auditLog.length > CONFIG.AUDIT_LOG_LIMIT) {
      this.auditLog = this.auditLog.slice(0, CONFIG.AUDIT_LOG_LIMIT);
    }
  }

  public toolEvent(tool: Tool, text: string): void {
    const now = nowISO();
    tool.updatedAt = now;
    if (!Array.isArray(tool.history)) tool.history = [];
    tool.history.push(`${now.replace('T', ' ').slice(0, 16)} | ${text}`);
  }

  public empEvent(emp: Employee, text: string): void {
    emp.updatedAt = nowISO();
    const e = emp as any;
    if (!Array.isArray(e.history)) e.history = [];
    e.history.push(`${nowISO().replace('T', ' ').slice(0, 16)} | ${text}`);
  }

  public getTool(id: string): Tool | undefined {
    return this.tools.find(t => t.id === id);
  }

  public async saveTool(tool: Tool): Promise<void> {
    const idx = this.tools.findIndex(t => t.id === tool.id);
    if (idx >= 0) {
      this.tools[idx] = tool;
    } else {
      this.tools.push(tool);
    }
    await this.save();
  }

  public async addPurchaseOrder(po: PurchaseOrder): Promise<void> {
    const idx = this.procurementLog.findIndex(p => p.orderId === po.orderId);
    if (idx >= 0) {
      this.procurementLog[idx] = po;
    } else {
      this.procurementLog.push(po);
    }
    await this.save();
  }

  public workstationOf(tool: Tool): string {
    const loc = this.workstationAndPostOf(tool);
    return loc.ws;
  }

  public workstationAndPostOf(tool: Tool): { ws: string; post: string } {
    if (tool.address && tool.address.zone) {
      const post = (tool.location && tool.location.includes('/'))
        ? tool.location.split('/')[1].trim()
        : '';
      return { ws: tool.address.zone, post };
    }
    if (tool.location) {
      if (tool.location.includes('/')) {
        const [w, p] = tool.location.split('/').map(s => s.trim());
        return { ws: w, post: p };
      }
      for (const ws of this.workstations) {
        if (tool.location.startsWith(ws)) {
          const rest = tool.location.slice(ws.length).replace(/^[\s\-\/]+/, '').trim();
          return { ws, post: rest };
        }
      }
      return { ws: tool.location, post: '' };
    }
    return { ws: 'Tool Gage', post: '' };
  }

  public getEmp(idOrName: string): Employee | undefined {
    return this.personnel.find(
      p => p.id === idOrName || p.name === idOrName || ((p as any).badge && String((p as any).badge).toUpperCase() === String(idOrName).toUpperCase())
    );
  }

  public empName(id: string | null | undefined): string {
    if (!id) return 'Unknown';
    const e = this.getEmp(id);
    return e ? e.name : 'Unknown';
  }

  public activeTools(): Tool[] {
    if (!this._activeTools) {
      this._activeTools = this.tools.filter(
        t => t.status !== 'Decommissioned' && (t.status as any) !== 'Retired' && (t.status as any) !== 'retired' && t.status !== 'Pending Delivery' as any
      );
    }
    return this._activeTools;
  }

  public retiredTools(): Tool[] {
    return this.tools.filter(
      t => t.status === 'Decommissioned' || (t.status as any) === 'Retired' || (t.status as any) === 'retired'
    );
  }

  public wearOf(tool: Tool): number {
    const a = tool.audit_history;
    return a && a.length ? a[a.length - 1].wear_pct || 0 : 0;
  }

  public touch(tool: Tool): void {
    tool.updatedAt = nowISO();
  }

  public recomputeStatuses(): void {
    const now = Date.now();
    this.tools.forEach(t => {
      if ((t.status as any) === 'Retired' || (t.status as any) === 'retired' || t.status === 'Decommissioned' || t.status === 'Maintenance') return;
      const lateReturn = t.dueReturn && d(t.dueReturn) && (d(t.dueReturn)!.getTime() < now);
      const lateCal = t.calDue && d(t.calDue) && (d(t.calDue)!.getTime() < now);
      if (lateReturn || lateCal) t.status = 'Overdue';
    });
  }

  public getOrganizerBins(rack?: string, shelf?: string): number[] {
    const bins = this.tools
      .filter(t => t.organizer && t.address && (t.address.rack || '') === (rack || '') && (t.address.shelf || '') === (shelf || '') && t.address.bin)
      .map(t => {
        const m = t.address!.bin!.match(/\d+/);
        return m ? parseInt(m[0], 10) : null;
      })
      .filter((n): n is number => n !== null && n >= 1);
    return [...new Set(bins)].sort((a, b) => a - b);
  }

  public getUsedBins(_zone?: string, rack?: string, shelf?: string): number[] {
    const orgBins = new Set(this.getOrganizerBins(rack, shelf));
    const used = this.tools
      .filter(t => !t.organizer && t.address && (t.address.rack || '') === (rack || '') && (t.address.shelf || '') === (shelf || '') && t.address.bin)
      .map(t => {
        const m = t.address!.bin!.match(/\d+/);
        return m ? parseInt(m[0], 10) : null;
      })
      .filter((n): n is number => n !== null && n >= 1 && !orgBins.has(n));
    return [...new Set(used)].sort((a, b) => a - b);
  }

  public getNextFreeBin(zone?: string, rack?: string, shelf?: string): string {
    if (!rack && !shelf) return '1';
    const used = [...this.getUsedBins(zone, rack, shelf), ...this.getOrganizerBins(rack, shelf)].sort((a, b) => a - b);
    let next = 1;
    for (let i = 0; i < used.length; i++) {
      if (used[i] === next) next++;
      else if (used[i] > next) break;
    }
    return next.toString();
  }

  public postsForZone(ws: string | null): string[] {
    return this.workposts.filter(p => p.ws === ws || p.ws === null).map(p => p.name);
  }

  public postObj(name: string, ws: string | null): WorkpostItem | undefined {
    return this.workposts.find(p => p.name === name && p.ws === (ws === undefined ? null : ws));
  }

  public postExists(name: string, ws: string | null): boolean {
    return Boolean(this.postObj(name, ws));
  }

  public programOf(ws: string): string | null {
    return this.wsProgram[ws] || null;
  }

  public wsOfProgram(prog: string): string[] {
    return this.workstations.filter(ws => this.wsProgram[ws] === prog);
  }

  public programOptions(): string[] {
    return [...new Set([...this.programs, ...Object.values(this.wsProgram)].filter(Boolean))].sort();
  }

  public addProgram(name: string): void {
    this.programs.push(name);
    this.log('REGISTRY_ADD', `programs: ${name}`);
    this.save();
  }

  public renameProgram(oldName: string, newName: string): { stations: number } {
    this.snapshot(`rename program ${oldName}`);
    const i = this.programs.indexOf(oldName);
    if (i >= 0) this.programs[i] = newName;
    let moved = 0;
    Object.keys(this.wsProgram).forEach(ws => {
      if (this.wsProgram[ws] === oldName) {
        this.wsProgram[ws] = newName;
        moved++;
      }
    });
    this.log('REG_RENAME_PROG', `${oldName} → ${newName} (stations: ${moved})`);
    this.save();
    return { stations: moved };
  }

  public removeProgram(name: string): { released: number } {
    this.snapshot(`remove program ${name}`);
    this.programs = this.programs.filter(p => p !== name);
    let released = 0;
    Object.keys(this.wsProgram).forEach(ws => {
      if (this.wsProgram[ws] === name) {
        delete this.wsProgram[ws];
        released++;
      }
    });
    this.log('REGISTRY_REMOVE', `programs: ${name} (${released} stations unassigned)`);
    this.save();
    return { released };
  }

  public setWsProgram(ws: string, prog: string | null): void {
    this.snapshot(`set program of ${ws}`);
    if (prog) this.wsProgram[ws] = prog;
    else delete this.wsProgram[ws];
    this.log('REG_SET_PROG', `${ws} → ${prog || 'no program'}`);
    this.save();
  }

  public addToLabelQueue(id: string): void {
    if (!this.labelQueue.includes(id)) {
      this.labelQueue.push(id);
      this.save();
    }
  }

  public removeFromLabelQueue(id: string): void {
    this.labelQueue = this.labelQueue.filter(i => i !== id);
    this.save();
  }

  public toggleLabelQueue(id: string): void {
    if (this.isInLabelQueue(id)) this.removeFromLabelQueue(id);
    else this.addToLabelQueue(id);
  }

  public isInLabelQueue(id: string): boolean {
    return Array.isArray(this.labelQueue) && this.labelQueue.includes(id);
  }

  public clearLabelQueue(): void {
    this.labelQueue = [];
    this.save();
  }

  public parseLocParts(loc: string): { sep: string | null; parts: string[] } | null {
    if (!loc) return null;
    if (loc.includes(' / ')) return { sep: ' / ', parts: loc.split(' / ') };
    if (loc.includes(' - ')) return { sep: ' - ', parts: loc.split(' - ') };
    return { sep: null, parts: [loc] };
  }

  public snapshot(reason: string): void {
    try {
      this._rollbackSnap = JSON.parse(JSON.stringify({
        ts: nowISO(),
        reason,
        workstations: this.workstations,
        workposts: this.workposts,
        programs: this.programs,
        wsProgram: this.wsProgram,
        personnel: this.personnel,
        tools: this.tools,
        audits5s: this.audits5s,
      }));
    } catch {}
  }

  public migrate(): void {
    this.tools.forEach(t => {
      if (!t.commissioned_date) t.commissioned_date = '2025-05-10';
      if (!Array.isArray(t.audit_history)) t.audit_history = [];
      if (!Array.isArray(t.history)) t.history = [];
      if (!t.serialNumber && !(t as any).sn) {
        const rnd = Math.random().toString(36).substring(2, 10).toUpperCase();
        t.serialNumber = (t.id.includes('-') ? t.id.split('-')[0] : 'SN') + '-' + rnd;
      } else if (!t.serialNumber && (t as any).sn) {
        t.serialNumber = (t as any).sn;
      }
      if (t.type === 'Permanent') {
        if (t.qty === undefined || t.qty === null) t.qty = 1;
        t.minQty = undefined;
      } else {
        if (t.qty === undefined || t.qty === null || t.qty < 0) t.qty = 15;
        if (!t.minQty) t.minQty = 5;
      }
      if (!t.location) t.location = 'Main Store';
    });
    this.meta.schemaVersion = CONFIG.SCHEMA_VERSION;
  }
}

export const Store = new StoreManager();
