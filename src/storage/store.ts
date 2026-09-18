import { Tool } from '../types/inventory';
import { PurchaseOrder } from '../types/procurement';
import { Employee, SystemUser } from '../types/personnel';
import { AuditLogEntry, Audit5S } from '../types/audit';
import { RegistryEvents, REGISTRY_KEYS, isTombstoned } from '../types/registry';
import { SopDocument, SopStatus } from '../types/sop';
import { AppDB, DBState } from './indexedDb';
import { SEED_USERS, SEED_WORKSTATIONS, SEED_TOOLS } from './seedData';
import { SEED_SOPS } from './sopSeed';
import { CONFIG } from '../config/constants';
import { nowISO, d } from '../utils/formatters';

export interface WorkpostItem {
  name: string;
  ws: string | null;
}

/** Names that mean "no station" rather than naming one. */
const PLACEHOLDER_STATIONS = ['Unassigned', 'Unknown', 'N/A', 'Storage / Crib'];

/** Outcome of `Store.importRegistryFromData()` / `Store.pendingRegistryImport()`. */
export interface RegistryImportResult {
  stations: number;
  posts: number;
  programs: number;
  links: number;
  /** Names of the stations that are missing, for the integrity report. */
  stationNames: string[];
  /** Free-text locations that look like storage areas, not stations. */
  skipped: string[];
}

export type StoreSubscriber = (state: DBState) => void;

class StoreManager {
  private _activeTools: Tool[] | null = null;
  private _subscribers: Set<StoreSubscriber> = new Set();
  private _dbChannel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('inv_db_sync') : null;
  private _rollbackSnap: any = null;
  /**
   * Last-persisted JSON per record, used by `stampDirtyRecords()` to guarantee
   * that every mutation — whatever path it took — advances `updatedAt`. Without
   * this a forgotten `touch()` silently loses the edit on the next sync merge.
   */
  private _persisted: { tools: Map<string, string>; personnel: Map<string, string> } = {
    tools: new Map(),
    personnel: new Map(),
  };

  public users: SystemUser[] = [];
  public workstations: string[] = [];
  public workposts: WorkpostItem[] = [];
  public personnel: Employee[] = [];
  public tools: Tool[] = [];
  public labelQueue: string[] = [];
  public programs: string[] = [];
  public wsProgram: Record<string, string> = {};
  public registryEvents: RegistryEvents = {};
  public sops: SopDocument[] = [];
  public auditLog: AuditLogEntry[] = [];
  public procurementLog: PurchaseOrder[] = [];
  public audits5s: Audit5S[] = [];
  public meta: Record<string, any> = { schemaVersion: CONFIG.SCHEMA_VERSION };

  /** Current actor published by AuthManager; used to attribute audit-log entries. */
  public actor: { username: string; role: string } = { username: 'operator', role: 'Operator' };

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
      workposts: this.workposts.map(p => (typeof p === 'string' ? { name: p, ws: null } : { name: p.name, ws: p.ws || null })),
      programs: this.programs,
      wsProgram: this.wsProgram,
      registryEvents: this.registryEvents,
      sops: this.sops,
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
    // Everything above is normalization, not user intent — treat the result as
    // the persisted baseline so `migrate()`/`recomputeStatuses()` cannot make
    // this device look newer than its peers.
    this.refreshPersistedFingerprints();
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
    this.registryEvents = data.registryEvents && typeof data.registryEvents === 'object' ? data.registryEvents : {};
    // Standards are seeded only while nothing is stored: an edited, obsoleted or
    // added document must never be overwritten by the seed.
    this.sops = Array.isArray(data.sops) && data.sops.length ? data.sops : [...SEED_SOPS];
    this.audits5s = Array.isArray(data.audits5s) ? data.audits5s : [];
    this.meta = data.meta && typeof data.meta === 'object' ? data.meta : { schemaVersion: CONFIG.SCHEMA_VERSION };
    this.labelQueue = Array.isArray(data.labelQueue) ? data.labelQueue : [];
    this._rollbackSnap = data.rollback || null;

    // Apply registry tombstones last: this is the single funnel for both the
    // IndexedDB load and the sync merge, so a removed program / station / post
    // can never be resurrected by a peer's stale array.
    this.applyRegistryTombstones();
    this.refreshPersistedFingerprints();
  }

  public async save(): Promise<void> {
    this._activeTools = null;
    if (this.auditLog.length > CONFIG.AUDIT_LOG_LIMIT) {
      this.auditLog = this.auditLog.slice(-CONFIG.AUDIT_LOG_LIMIT);
    }

    // Safety net: stamp every record that changed since the last write, so a
    // mutation path that forgot `touch()` still wins the next LWW merge.
    this.stampDirtyRecords();

    const state: Partial<DBState> = {
      tools: this.tools,
      personnel: this.personnel,
      users: this.users,
      auditLog: this.auditLog,
      procurementLog: this.procurementLog,
      workstations: this.workstations,
      workposts: this.workposts.map(p => ({ name: p.name, ws: p.ws || null })),
      programs: this.programs,
      wsProgram: this.wsProgram,
      registryEvents: this.registryEvents,
      sops: this.sops,
      audits5s: this.audits5s,
      meta: this.meta,
      labelQueue: this.labelQueue,
      rollback: this._rollbackSnap,
    };

    await AppDB.saveAll(state);
    this.refreshPersistedFingerprints();
    if (this._dbChannel) {
      this._dbChannel.postMessage({ type: 'db_saved', ts: Date.now() });
    }
    this.notify();
  }

  public log(action: string, details: string = '', user?: string, role?: string): void {
    const actor = this.actor || { username: 'operator', role: 'Operator' };
    this.auditLog.unshift({
      id: 'aud_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      ts: nowISO(),
      action,
      details: String(details),
      user: user || actor.username,
      role: role || actor.role,
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

  /**
   * Personnel that still exist for the user. Tombstoned (removed) employees stay
   * in `personnel` so tool assignments and history keep resolving their names,
   * but must never show up in lists, pickers or counters.
   */
  public activePersonnel(): Employee[] {
    return this.personnel.filter(e => !e.deletedAt);
  }

  /**
   * Soft-delete an employee. The record is kept with a `deletedAt` tombstone so a
   * peer holding an older copy cannot resurrect it on the next sync merge.
   */
  public removePersonnel(id: string): boolean {
    const emp = this.personnel.find(p => p.id === id);
    if (!emp || emp.deletedAt) return false;
    const now = nowISO();
    emp.deletedAt = now;
    emp.updatedAt = now;
    this.log('EMP_REMOVE', `${emp.id} ${emp.name}`);
    this.save();
    return true;
  }

  // --- SOP & Standards (controlled documents) ---

  public getSop(id: string): SopDocument | undefined {
    return this.sops.find(s => s.id === id);
  }

  /** Documents currently in force. Obsolete ones stay stored for the record. */
  public approvedSops(): SopDocument[] {
    return this.sops.filter(s => s.status === 'Approved');
  }

  /**
   * Insert or update a controlled document. Controlled documents are never
   * deleted — retiring one means setting `status: 'Obsolete'` — so there is no
   * tombstone to carry and the sync merge can stay a plain union by id.
   */
  public async saveSop(doc: SopDocument): Promise<void> {
    const next: SopDocument = { ...doc, updatedAt: nowISO() };
    const idx = this.sops.findIndex(s => s.id === doc.id);
    if (idx >= 0) this.sops[idx] = next;
    else this.sops.push(next);
    this.log('SOP_SAVE', `${doc.id} rev ${doc.revision} (${doc.status})`);
    await this.save();
  }

  public async setSopStatus(id: string, status: SopStatus): Promise<boolean> {
    const sop = this.getSop(id);
    if (!sop) return false;
    sop.status = status;
    sop.updatedAt = nowISO();
    this.log('SOP_STATUS', `${id} → ${status}`);
    await this.save();
    return true;
  }

  /** Start a new revision: bump the label, re-date it and drop back to Draft. */
  public async newSopRevision(id: string): Promise<SopDocument | null> {
    const sop = this.getSop(id);
    if (!sop) return null;
    const n = Number.parseFloat(sop.revision);
    sop.revision = Number.isFinite(n) ? String(n + 1) : `${sop.revision}.1`;
    sop.effectiveDate = nowISO().split('T')[0];
    sop.status = 'Draft';
    sop.updatedAt = nowISO();
    this.log('SOP_REVISION', `${id} → rev ${sop.revision} (Draft)`);
    await this.save();
    return sop;
  }

  public empName(id: string | null | undefined): string {
    if (!id) return 'Unknown';
    const e = this.getEmp(id);
    return e ? e.name : 'Unknown';
  }

  public activeTools(): Tool[] {
    if (!this._activeTools) {
      this._activeTools = this.tools.filter(
        t => t.status !== 'Decommissioned' && (t.status as any) !== 'Retired' && (t.status as any) !== 'retired'
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

  /** Mark a registry key as created (`del: false`) or removed (`del: true`). */
  private markRegistry(key: string, del: boolean): void {
    this.registryEvents[key] = { t: nowISO(), del };
  }

  /** Drop every registry entry that currently carries a tombstone. */
  private applyRegistryTombstones(): void {
    const dead = (key: string) => isTombstoned(this.registryEvents, key);
    this.programs = this.programs.filter(p => !dead(REGISTRY_KEYS.program(p)));
    this.workstations = this.workstations.filter(ws => !dead(REGISTRY_KEYS.workstation(ws)));
    this.workposts = this.workposts.filter(p =>
      !dead(REGISTRY_KEYS.workpost(p.name, p.ws)) &&
      // A removed station takes its posts with it, even if a peer only sent us
      // the station tombstone.
      !(p.ws && dead(REGISTRY_KEYS.workstation(p.ws)))
    );
    Object.keys(this.wsProgram).forEach(ws => {
      if (dead(REGISTRY_KEYS.wsProgram(ws)) || dead(REGISTRY_KEYS.workstation(ws))) delete this.wsProgram[ws];
    });
  }

  /**
   * Advance `updatedAt` on every tool/employee whose content changed since the
   * last write. This is what makes "every mutation path stamps `updatedAt`"
   * true by construction instead of by convention.
   */
  private stampDirtyRecords(): void {
    const now = nowISO();
    const stamp = <T extends { id?: string; updatedAt?: string }>(list: T[], prev: Map<string, string>): void => {
      list.forEach(rec => {
        if (!rec || !rec.id) return;
        const before = prev.get(rec.id);
        if (before === undefined || JSON.stringify(rec) !== before) rec.updatedAt = now;
      });
    };
    stamp(this.tools, this._persisted.tools);
    stamp(this.personnel, this._persisted.personnel);
  }

  /** Re-baseline the change detector against the current in-memory state. */
  private refreshPersistedFingerprints(): void {
    this._persisted = {
      tools: new Map(this.tools.filter(t => t && t.id).map(t => [t.id, JSON.stringify(t)])),
      personnel: new Map(this.personnel.filter(p => p && p.id).map(p => [p.id, JSON.stringify(p)])),
    };
  }

  public recomputeStatuses(): void {
    const now = Date.now();
    this.tools.forEach(t => {
      if ((t.status as any) === 'Retired' || (t.status as any) === 'retired' || t.status === 'Decommissioned' || t.status === 'Maintenance' || t.status === 'Pending Delivery') return;
      const lateReturn = t.dueReturn && d(t.dueReturn) && (d(t.dueReturn)!.getTime() < now);
      const lateCal = t.calDue && d(t.calDue) && (d(t.calDue)!.getTime() < now);
      if (lateReturn || lateCal) t.status = 'Overdue';
    });
  }

  /**
   * Bin numbers that hold an organizer on a shelf (Rack+Shelf).
   * `excludeId` skips the record being edited so its own bin is not reported
   * as occupied while its address is re-validated.
   */
  public getOrganizerBins(rack?: string, shelf?: string, excludeId?: string): number[] {
    const bins = this.tools
      .filter(t => t.id !== excludeId && t.organizer && t.address && (t.address.rack || '') === (rack || '') && (t.address.shelf || '') === (shelf || '') && t.address.bin)
      .map(t => {
        const m = t.address!.bin!.match(/\d+/);
        return m ? parseInt(m[0], 10) : null;
      })
      .filter((n): n is number => n !== null && n >= 1);
    return [...new Set(bins)].sort((a, b) => a - b);
  }

  /**
   * Occupied bin numbers on a shelf, ascending. Keyed by Rack+Shelf (the zone is
   * deliberately ignored: `address.zone` does not always match the workstation
   * list, while rack letters are unique). Organizer bins are not blocking — more
   * items can be added inside them. `excludeId` skips the record being edited.
   */
  public getUsedBins(_zone?: string, rack?: string, shelf?: string, excludeId?: string): number[] {
    const orgBins = new Set(this.getOrganizerBins(rack, shelf, excludeId));
    const used = this.tools
      .filter(t => t.id !== excludeId && !t.organizer && t.address && (t.address.rack || '') === (rack || '') && (t.address.shelf || '') === (shelf || '') && t.address.bin)
      .map(t => {
        const m = t.address!.bin!.match(/\d+/);
        return m ? parseInt(m[0], 10) : null;
      })
      .filter((n): n is number => n !== null && n >= 1 && !orgBins.has(n));
    return [...new Set(used)].sort((a, b) => a - b);
  }

  public getNextFreeBin(zone?: string, rack?: string, shelf?: string, excludeId?: string): string {
    if (!rack && !shelf) return '1';
    const used = [...this.getUsedBins(zone, rack, shelf, excludeId), ...this.getOrganizerBins(rack, shelf, excludeId)].sort((a, b) => a - b);
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
    this.markRegistry(REGISTRY_KEYS.program(name), false);
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
    this.markRegistry(REGISTRY_KEYS.program(oldName), true);
    this.markRegistry(REGISTRY_KEYS.program(newName), false);
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
    this.markRegistry(REGISTRY_KEYS.program(name), true);
    this.log('REGISTRY_REMOVE', `programs: ${name} (${released} stations unassigned)`);
    this.save();
    return { released };
  }

  public setWsProgram(ws: string, prog: string | null): void {
    this.snapshot(`set program of ${ws}`);
    if (prog) this.wsProgram[ws] = prog;
    else delete this.wsProgram[ws];
    this.markRegistry(REGISTRY_KEYS.wsProgram(ws), !prog);
    this.log('REG_SET_PROG', `${ws} → ${prog || 'no program'}`);
    this.save();
  }

  public programExists(name: string): boolean {
    return this.programs.includes(name);
  }

  /** Add a station, optionally assigning it to a program (null → "no program" group). */
  public addWorkstation(name: string, program: string | null = null): void {
    if (!this.workstations.includes(name)) this.workstations.push(name);
    this.markRegistry(REGISTRY_KEYS.workstation(name), false);
    if (program && this.programs.includes(program)) {
      this.wsProgram[name] = program;
      this.markRegistry(REGISTRY_KEYS.wsProgram(name), false);
    }
    this.log('REGISTRY_ADD', `workstations: ${name}${program ? ` (${program})` : ''}`);
    this.save();
  }

  public addWorkpost(name: string, ws: string | null): void {
    this.workposts.push({ name, ws: ws || null });
    this.markRegistry(REGISTRY_KEYS.workpost(name, ws), false);
    this.log('REGISTRY_ADD', `workposts: ${name} (${ws || 'no zone'})`);
    this.save();
  }

  /** Rename a station: registry + program map + child posts + personnel + tool locations. */
  public renameWorkstation(oldName: string, newName: string): void {
    this.snapshot(`rename zone ${oldName}`);
    const i = this.workstations.indexOf(oldName);
    if (i >= 0) this.workstations[i] = newName;
    if (this.wsProgram[oldName]) {
      this.wsProgram[newName] = this.wsProgram[oldName];
      delete this.wsProgram[oldName];
      this.markRegistry(REGISTRY_KEYS.wsProgram(oldName), true);
      this.markRegistry(REGISTRY_KEYS.wsProgram(newName), false);
    }
    // Post keys embed their station, so a rename has to retire the old keys.
    this.workposts.forEach(p => {
      if (p.ws === oldName) {
        this.markRegistry(REGISTRY_KEYS.workpost(p.name, oldName), true);
        this.markRegistry(REGISTRY_KEYS.workpost(p.name, newName), false);
        p.ws = newName;
      }
    });
    this.personnel.forEach(e => { if (e.ws === oldName) e.ws = newName; });
    this.tools.forEach(t => {
      if (t.address && t.address.zone === oldName) t.address.zone = newName;
      const L = this.parseLocParts(t.location || '');
      if (L && L.parts[0] === oldName) {
        L.parts[0] = newName;
        t.location = L.parts.join(L.sep || ' / ');
      }
    });
    this.markRegistry(REGISTRY_KEYS.workstation(oldName), true);
    this.markRegistry(REGISTRY_KEYS.workstation(newName), false);
    this.log('REG_RENAME_WS', `${oldName} → ${newName}`);
    this.save();
  }

  /** Rename a post inside a station (ws=null → the global "no zone" post). */
  public renameWorkpost(ws: string | null, oldName: string, newName: string): void {
    this.snapshot(`rename post ${oldName}`);
    const p = this.postObj(oldName, ws);
    if (p) p.name = newName;
    this.personnel.forEach(e => {
      const inZone = ws === null || e.ws === ws;
      if (inZone && e.post === oldName) e.post = newName;
    });
    this.tools.forEach(t => {
      const L = this.parseLocParts(t.location || '');
      if (L && L.parts.length > 1 && L.parts[1] === oldName && (ws === null || L.parts[0] === ws)) {
        L.parts[1] = newName;
        t.location = L.parts.join(L.sep || ' / ');
      }
    });
    this.markRegistry(REGISTRY_KEYS.workpost(oldName, ws), true);
    this.markRegistry(REGISTRY_KEYS.workpost(newName, ws), false);
    this.log('REG_RENAME_WP', `${oldName} → ${newName}`);
    this.save();
  }

  /** Move a post to another station together with its personnel and tools. */
  public moveWorkpost(name: string, fromWs: string | null, toWs: string | null): void {
    this.snapshot(`move post ${name}`);
    const p = this.postObj(name, fromWs);
    if (p) p.ws = toWs || null;
    if (fromWs !== null) {
      this.personnel.forEach(e => {
        if (e.post === name && e.ws === fromWs) e.ws = toWs || '';
      });
      this.tools.forEach(t => {
        const L = this.parseLocParts(t.location || '');
        if (L && L.parts.length > 1 && L.parts[1] === name && L.parts[0] === fromWs) {
          L.parts[0] = toWs || '';
          t.location = L.parts.filter(Boolean).join(L.sep || ' / ');
          if (t.address) t.address.zone = toWs || '';
        }
      });
    }
    this.markRegistry(REGISTRY_KEYS.workpost(name, fromWs), true);
    this.markRegistry(REGISTRY_KEYS.workpost(name, toWs), false);
    this.log('REG_MOVE_WP', `${name}: ${fromWs || 'no zone'} → ${toWs || 'no zone'}`);
    this.save();
  }

  /** Remove a station: its posts are removed in cascade (dangling refs are left for integrity scan). */
  public removeWorkstation(name: string): { posts: number } {
    this.snapshot(`remove zone ${name}`);
    const doomed = this.workposts.filter(p => p.ws === name);
    const posts = doomed.length;
    doomed.forEach(p => this.markRegistry(REGISTRY_KEYS.workpost(p.name, name), true));
    this.workposts = this.workposts.filter(p => p.ws !== name);
    this.workstations = this.workstations.filter(w => w !== name);
    delete this.wsProgram[name];
    this.markRegistry(REGISTRY_KEYS.workstation(name), true);
    this.markRegistry(REGISTRY_KEYS.wsProgram(name), true);
    this.log('REGISTRY_REMOVE', `workstations: ${name} (${posts} posts)`);
    this.save();
    return { posts };
  }

  public removeWorkpost(name: string, ws: string | null): { removed: number } {
    this.snapshot(`remove post ${name}`);
    const before = this.workposts.length;
    this.workposts = this.workposts.filter(p => !(p.name === name && p.ws === (ws || null)));
    const removed = before - this.workposts.length;
    this.markRegistry(REGISTRY_KEYS.workpost(name, ws), true);
    this.log('REGISTRY_REMOVE', `workposts: ${name} (${ws || 'no zone'})`);
    this.save();
    return { removed };
  }

  /** Usage counters for a station, used by the delete-confirmation dialogs. */
  public zoneUsage(name: string): { posts: number; emp: number; tools: number } {
    const posts = this.workposts.filter(p => p.ws === name).length;
    const emp = this.activePersonnel().filter(e => e.ws === name).length;
    let tools = 0;
    this.tools.forEach(t => {
      const L = this.parseLocParts(t.location || '');
      if (L && L.parts[0] === name) tools++;
    });
    return { posts, emp, tools };
  }

  /**
   * Rebuild the registry from the data that already references it.
   *
   * Tools and personnel carry their station / post / program as free text (that is
   * how the legacy monolith stored them), so a station can be in daily use long
   * before it is registered. This adds every referenced-but-unregistered station,
   * post and program **without touching the references** — the non-destructive
   * counterpart of the integrity check's "move to default station" repair.
   *
   * Sources, in order of trust:
   *   • `personnel.ws` / `personnel.post` — structured fields, always a station;
   *   • `tool.address.zone` — structured, always a station;
   *   • `tool.location` containing an explicit ` / ` or ` - ` separator — the part
   *     before it is the station, the part after it is the post.
   *
   * A bare free-text location (`Shadow Board`, `Tool Crib`, `Calibration Lab`) is a
   * storage area, not a station, so it is reported in `skipped` instead of being
   * registered — otherwise the registry fills up with shelves.
   */
  public importRegistryFromData(): RegistryImportResult {
    const plan = this.collectRegistryImport();
    const result: RegistryImportResult = {
      stations: plan.stations.length,
      posts: plan.posts.length,
      programs: plan.programs.length,
      links: plan.links.length,
      stationNames: plan.stations,
      skipped: plan.skipped,
    };

    if (!result.stations && !result.posts && !result.programs && !result.links) return result;

    this.snapshot('import registry from data');
    plan.stations.forEach(ws => {
      this.workstations.push(ws);
      this.markRegistry(REGISTRY_KEYS.workstation(ws), false);
    });
    plan.posts.forEach(p => {
      this.workposts.push({ name: p.name, ws: p.ws });
      this.markRegistry(REGISTRY_KEYS.workpost(p.name, p.ws), false);
    });
    plan.programs.forEach(prog => {
      this.programs.push(prog);
      this.markRegistry(REGISTRY_KEYS.program(prog), false);
    });
    plan.links.forEach(l => {
      this.wsProgram[l.ws] = l.program;
      this.markRegistry(REGISTRY_KEYS.wsProgram(l.ws), false);
    });

    this.log('REGISTRY_IMPORT',
      `stations: ${result.stations}, posts: ${result.posts}, programs: ${result.programs}, links: ${result.links}`);
    this.save();
    return result;
  }

  /**
   * What `importRegistryFromData()` *would* add, without changing anything. The
   * integrity check reports from this so the anomaly list and the repair always
   * agree on what counts as a missing station.
   */
  public pendingRegistryImport(): RegistryImportResult {
    const plan = this.collectRegistryImport();
    return {
      stations: plan.stations.length,
      posts: plan.posts.length,
      programs: plan.programs.length,
      links: plan.links.length,
      stationNames: plan.stations,
      skipped: plan.skipped,
    };
  }

  /** Pure computation of the import plan — no mutation, no logging, no save. */
  private collectRegistryImport(): {
    stations: string[];
    posts: { name: string; ws: string }[];
    programs: string[];
    links: { ws: string; program: string }[];
    skipped: string[];
  } {
    const stations: string[] = [];
    const posts: { name: string; ws: string }[] = [];
    const programs: string[] = [];
    const links: { ws: string; program: string }[] = [];
    const skipped = new Set<string>();
    /** First program declared by a tool at each station, used to link it. */
    const stationProgram: Record<string, string> = {};

    const hasStation = (ws: string) => this.workstations.includes(ws) || stations.includes(ws);
    const addStation = (ws: string) => { if (!hasStation(ws)) stations.push(ws); };
    const addPost = (post: string, ws: string) => {
      if (!post) return;
      if (this.postExists(post, ws)) return;
      if (posts.some(p => p.name === post && p.ws === ws)) return;
      posts.push({ name: post, ws });
    };
    const noteProgram = (ws: string, prog?: string | null) => {
      const clean = (prog || '').trim();
      if (ws && clean && !stationProgram[ws]) stationProgram[ws] = clean;
    };

    // 1. Personnel — the most reliable source, and the one the risk chart uses
    //    for assigned tools (`workstationAndPostOf` prefers the holder's station).
    this.personnel.forEach(e => {
      if (e.deletedAt) return;
      const legacy = e as any;
      const ws = (e.ws || legacy.workstation || legacy.defaultWs || '').trim();
      const post = (e.post || legacy.defaultPost || '').trim();
      if (!this.isRegisterableStation(ws)) return;
      addStation(ws);
      addPost(post, ws);
    });

    // 2. Tools — structured address zone, then an explicit `station / post` location.
    this.tools.forEach(t => {
      const zone = (t.address?.zone || '').trim();
      if (this.isRegisterableStation(zone)) addStation(zone);

      const loc = (t.location || '').trim();
      const parts = loc.includes(' / ') ? loc.split(' / ') : loc.includes(' - ') ? loc.split(' - ') : null;
      if (parts && parts.length > 1) {
        const ws = parts[0].trim();
        const post = parts.slice(1).join(' / ').trim();
        if (this.isRegisterableStation(ws)) {
          addStation(ws);
          addPost(post, ws);
          noteProgram(ws, t.program);
        }
      } else if (loc && loc !== 'Tool Gage' && !this.workstations.includes(loc) && !PLACEHOLDER_STATIONS.includes(loc)) {
        // A bare free-text location that is not a registered station is a storage
        // area (Shadow Board, Tool Crib, Calibration Lab) — report it, never
        // register it, or the registry fills up with shelves.
        skipped.add(loc);
      }
    });

    // 3. Programs declared on tools, then link each station to its program.
    this.tools.forEach(t => {
      const prog = (t.program || '').trim();
      if (prog && !this.programs.includes(prog) && !programs.includes(prog)) programs.push(prog);
    });
    Object.entries(stationProgram).forEach(([ws, prog]) => {
      if (!this.wsProgram[ws] && (this.programs.includes(prog) || programs.includes(prog))) {
        links.push({ ws, program: prog });
      }
    });

    return { stations, posts, programs, links, skipped: [...skipped].sort() };
  }

  /** A name is registerable when it is a real station, not a placeholder or area. */
  private isRegisterableStation(name: string): boolean {
    const clean = (name || '').trim();
    if (!clean) return false;
    return !PLACEHOLDER_STATIONS.includes(clean);
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
        registryEvents: this.registryEvents,
        sops: this.sops,
        personnel: this.personnel,
        tools: this.tools,
        audits5s: this.audits5s,
      }));
    } catch (e) {
      console.error('[store:snapshot] Failed to capture rollback snapshot:', e);
    }
  }

  /** Snapshot metadata for the "rollback last cascade" UI, or null when none exists. */
  public rollbackInfo(): { ts: string; reason: string } | null {
    return this._rollbackSnap || null;
  }

  /**
   * Restore the last cascade snapshot (taken by `snapshot()` before program /
   * workstation registry edits).
   *
   * RBAC is enforced by the caller (`Auth.doAction('Administrator', …)`) — this
   * module deliberately does not import `Auth`, which imports `Store`.
   */
  public async rollback(): Promise<boolean> {
    const snap = this.rollbackInfo();
    if (!snap) return false;

    // Validate the critical arrays before applying, so a corrupt snapshot can
    // never wipe live data.
    if (!Array.isArray((snap as any).tools) || !Array.isArray((snap as any).personnel)) {
      console.error('[store:rollback] Corrupt snapshot — tools or personnel not arrays:', snap);
      return false;
    }

    const s = snap as any;
    this.workstations = Array.isArray(s.workstations) ? JSON.parse(JSON.stringify(s.workstations)) : this.workstations;
    this.workposts = Array.isArray(s.workposts) ? JSON.parse(JSON.stringify(s.workposts)) : this.workposts;
    this.programs = s.programs ? JSON.parse(JSON.stringify(s.programs)) : [];
    this.wsProgram = s.wsProgram ? JSON.parse(JSON.stringify(s.wsProgram)) : {};
    this.registryEvents = s.registryEvents ? JSON.parse(JSON.stringify(s.registryEvents)) : {};
    this.sops = s.sops ? JSON.parse(JSON.stringify(s.sops)) : (this.sops || []);
    this.personnel = JSON.parse(JSON.stringify(s.personnel));
    this.tools = JSON.parse(JSON.stringify(s.tools));
    this.audits5s = s.audits5s ? JSON.parse(JSON.stringify(s.audits5s)) : (this.audits5s || []);

    this.migrate();
    this.log('ROLLBACK', `to ${s.ts} (${s.reason})`);
    await this.save();
    return true;
  }

  public migrate(): void {
    this.tools.forEach(t => {
      if (!t.commissioned_date) t.commissioned_date = '2025-05-10';
      if (!Array.isArray(t.audit_history)) t.audit_history = [];
      if (!Array.isArray(t.calHistory)) t.calHistory = [];
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
    // Personnel: normalize legacy monolith fields (`workstation`/`defaultWs`,
    // `defaultPost`) onto the current `ws`/`post` so station/post resolve everywhere.
    this.personnel.forEach(e => {
      const legacy = e as any;
      if (!e.ws && (legacy.workstation || legacy.defaultWs)) e.ws = legacy.workstation || legacy.defaultWs;
      if (!e.post && legacy.defaultPost) e.post = legacy.defaultPost;
    });
    // Users: any account without a real verifier must go through PIN setup
    // before it can authenticate. This covers both brand-new seed accounts
    // (shipped with an empty pwHash) and stored rows that predate the flag.
    this.users.forEach(u => {
      if (!u || typeof u.pwHash !== 'string' || u.pwHash === '') {
        u.needsPinSetup = true;
      }
    });
    this.meta.schemaVersion = CONFIG.SCHEMA_VERSION;
  }
}

export const Store = new StoreManager();
