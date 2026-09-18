import { Tool } from '../types/inventory';
import { PurchaseOrder } from '../types/procurement';
import { Employee, SystemUser } from '../types/personnel';
import { AuditLogEntry, Audit5S } from '../types/audit';
import { RegistryEvents } from '../types/registry';
import { nowISO } from '../utils/formatters';
import { SCHEMA_VERSION } from '../config/constants';

export interface DBState {
  tools: Tool[];
  personnel: Employee[];
  users: SystemUser[];
  auditLog: AuditLogEntry[];
  procurementLog: PurchaseOrder[];
  workstations: string[];
  workposts: (string | { name: string; ws?: string | null })[];
  programs: string[];
  wsProgram: Record<string, string>;
  /** Soft-delete tombstones for the string-array registries. */
  registryEvents?: RegistryEvents;
  audits5s: Audit5S[];
  meta: Record<string, any>;
  labelQueue: any[];
  rollback?: any;
}

export const AppDB = {
  NAME: 'inv_inventory_db',
  VERSION: 1,
  STORES: {
    tools: 'tools',
    personnel: 'personnel',
    users: 'users',
    audit: 'audit',
    procurement: 'procurement',
    settings: 'settings',
    photos: 'photos',
  },
  _db: null as IDBDatabase | null,
  _failed: false,

  isAvailable(): boolean {
    return typeof indexedDB !== 'undefined' && !this._failed;
  },

  open(): Promise<IDBDatabase> {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        this._failed = true;
        return reject(new Error('IndexedDB unavailable'));
      }
      const req = indexedDB.open(this.NAME, this.VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.STORES.tools)) {
          const store = db.createObjectStore(this.STORES.tools, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('category', 'category', { unique: false });
        }
        if (!db.objectStoreNames.contains(this.STORES.personnel)) {
          const store = db.createObjectStore(this.STORES.personnel, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
        }
        if (!db.objectStoreNames.contains(this.STORES.users)) {
          db.createObjectStore(this.STORES.users, { keyPath: 'username' });
        }
        if (!db.objectStoreNames.contains(this.STORES.audit)) {
          const store = db.createObjectStore(this.STORES.audit, { keyPath: 'id' });
          store.createIndex('ts', 'ts', { unique: false });
        }
        if (!db.objectStoreNames.contains(this.STORES.procurement)) {
          const store = db.createObjectStore(this.STORES.procurement, { keyPath: 'id' });
          store.createIndex('orderId', 'orderId', { unique: false });
        }
        if (!db.objectStoreNames.contains(this.STORES.settings)) {
          db.createObjectStore(this.STORES.settings, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(this.STORES.photos)) {
          const store = db.createObjectStore(this.STORES.photos, { keyPath: 'id' });
          store.createIndex('toolId', 'toolId', { unique: false });
        }
      };

      req.onsuccess = () => {
        this._db = req.result;
        this._db.onversionchange = () => {
          this._db?.close();
          this._db = null;
        };
        resolve(this._db);
      };

      req.onerror = () => {
        this._failed = true;
        console.error('[AppDB] open failed:', req.error);
        reject(req.error);
      };
    });
  },

  async getAll<T = any>(storeName: string): Promise<T[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async get<T = any>(storeName: string, key: IDBValidKey): Promise<T | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async put(storeName: string, item: any): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  },

  async delete(storeName: string, key: IDBValidKey): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  },

  async clear(storeName: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  },

  async setAll(storeName: string, items: any[]): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
      for (const item of items) {
        if (item) store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  },

  async getSetting<T = any>(key: string, fallback: T | null = null): Promise<T | null> {
    const res = await this.get(this.STORES.settings, key);
    return res ? res.value : fallback;
  },

  async setSetting(key: string, value: any): Promise<void> {
    return this.put(this.STORES.settings, { key, value });
  },

  async saveAll(state: Partial<DBState>): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([
        this.STORES.tools,
        this.STORES.personnel,
        this.STORES.users,
        this.STORES.audit,
        this.STORES.procurement,
        this.STORES.settings,
      ], 'readwrite');

      if (Array.isArray(state.tools)) {
        const store = tx.objectStore(this.STORES.tools);
        store.clear();
        for (const t of state.tools) {
          if (t && t.id) store.put(t);
        }
      }

      if (Array.isArray(state.personnel)) {
        const store = tx.objectStore(this.STORES.personnel);
        store.clear();
        for (const p of state.personnel) {
          if (p && p.id) store.put(p);
        }
      }

      if (Array.isArray(state.users)) {
        const store = tx.objectStore(this.STORES.users);
        store.clear();
        for (const u of state.users) {
          if (u && u.username) store.put(u);
        }
      }

      if (Array.isArray(state.auditLog)) {
        const store = tx.objectStore(this.STORES.audit);
        store.clear();
        for (let i = 0; i < state.auditLog.length; i++) {
          const l = state.auditLog[i];
          if (l) {
            if (!l.id) l.id = 'aud_' + (l.ts || nowISO()) + '_' + i + '_' + Math.random().toString(36).slice(2, 6);
            store.put(l);
          }
        }
      }

      if (Array.isArray(state.procurementLog)) {
        const store = tx.objectStore(this.STORES.procurement);
        store.clear();
        for (let i = 0; i < state.procurementLog.length; i++) {
          const req = state.procurementLog[i];
          if (req) {
            if (!req.id) req.id = req.orderId || ('proc_' + i + '_' + Math.random().toString(36).slice(2, 6));
            store.put(req);
          }
        }
      }

      const settingsKeys: (keyof DBState)[] = ['workstations', 'workposts', 'programs', 'wsProgram', 'registryEvents', 'audits5s', 'meta', 'labelQueue', 'rollback'];
      const storeSettings = tx.objectStore(this.STORES.settings);
      for (const k of settingsKeys) {
        if (state[k] !== undefined) {
          storeSettings.put({ key: k, value: state[k] });
        }
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  },

  async loadAll(): Promise<DBState> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([
        this.STORES.tools,
        this.STORES.personnel,
        this.STORES.users,
        this.STORES.audit,
        this.STORES.procurement,
        this.STORES.settings,
      ], 'readonly');

      const reqTools = tx.objectStore(this.STORES.tools).getAll();
      const reqPersonnel = tx.objectStore(this.STORES.personnel).getAll();
      const reqUsers = tx.objectStore(this.STORES.users).getAll();
      const reqAudit = tx.objectStore(this.STORES.audit).getAll();
      const reqProcure = tx.objectStore(this.STORES.procurement).getAll();
      const reqSettings = tx.objectStore(this.STORES.settings).getAll();

      tx.oncomplete = () => {
        const settingsList = reqSettings.result || [];
        const settingsMap: Record<string, any> = {};
        for (const s of settingsList) {
          if (s && s.key) settingsMap[s.key] = s.value;
        }
        resolve({
          tools: reqTools.result || [],
          personnel: reqPersonnel.result || [],
          users: reqUsers.result || [],
          auditLog: (reqAudit.result || []).sort((a: any, b: any) => (b.ts || '').localeCompare(a.ts || '')),
          procurementLog: reqProcure.result || [],
          workstations: settingsMap.workstations || [],
          workposts: settingsMap.workposts || [],
          programs: settingsMap.programs || [],
          wsProgram: settingsMap.wsProgram || {},
          registryEvents: settingsMap.registryEvents || {},
          audits5s: settingsMap.audits5s || [],
          meta: settingsMap.meta || { schemaVersion: SCHEMA_VERSION },
          labelQueue: settingsMap.labelQueue || [],
          rollback: settingsMap.rollback || null,
        });
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  },

  async migrateFromLocalStorage(): Promise<boolean> {
    if (typeof localStorage === 'undefined') return false;
    let rawDb: string | null = null;
    try {
      rawDb = localStorage.getItem('inv_inventory_db');
    } catch (e) {
      console.error('[AppDB:migrateFromLocalStorage] Failed to read legacy localStorage db', e);
    }
    if (rawDb) {
      try {
        const db = JSON.parse(rawDb);
        const state: Partial<DBState> = {
          tools: db.tools || [],
          personnel: db.personnel || [],
          users: db.users || [],
          auditLog: db.auditLog || [],
          procurementLog: db.procurementLog || [],
          workstations: db.workstations || [],
          workposts: db.workposts || [],
          programs: db.programs || [],
          wsProgram: db.wsProgram || {},
          registryEvents: db.registryEvents || {},
          audits5s: db.audits5s || [],
          meta: db.meta || { schemaVersion: SCHEMA_VERSION },
          labelQueue: db.labelQueue || [],
        };
        if ((state.tools && state.tools.length > 0) || (state.personnel && state.personnel.length > 0) || (state.workstations && state.workstations.length > 0)) {
          await this.saveAll(state);
          try {
            localStorage.removeItem('inv_inventory_db');
          } catch (e) {
            console.error('[AppDB:migrateFromLocalStorage] Failed to remove legacy localStorage db after migration', e);
          }
          return true;
        }
      } catch (e) {
        console.error('[AppDB] Failed to migrate inv_inventory_db:', e);
      }
    }
    return false;
  },
};
