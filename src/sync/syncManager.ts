import { SyncStatus, SyncPayload, SyncPing } from '../types/sync';
import {
  getOrCreateDeviceId,
  getActiveSyncRoom,
  setActiveSyncRoom as persistActiveRoom,
  pushSyncPayload,
  pullSyncPayload,
  pushPhotoToCloud,
} from './syncApi';
import { subscribeToLiveCloudStream } from './liveRelay';
import { mergeSyncPayloads } from './conflictResolver';
import { Store } from '../storage/store';

export type SyncStatusListener = (status: SyncStatus, lastSynced: Date | null, room: string) => void;

class SyncManager {
  public status: SyncStatus = 'synced';
  public lastSyncedAt: Date | null = null;
  public room: string = getActiveSyncRoom();
  public deviceId: string = getOrCreateDeviceId();

  private _statusListeners: Set<SyncStatusListener> = new Set();
  private _sseUnsubscribe: (() => void) | null = null;
  private _pushDebounceTimer: any = null;
  private _pollIntervalTimer: any = null;
  private _isSyncing: boolean = false;
  private _lastPushedTimestamp: string = '';
  private _lastReceivedTimestamp: string = '';
  private _version: number = 1;

  public init(): void {
    this.room = getActiveSyncRoom();
    this.deviceId = getOrCreateDeviceId();

    // Listen to network status
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.setStatus('pending');
        this.triggerPull().catch(e => console.error('Online pull failed:', e));
      });
      window.addEventListener('offline', () => {
        this.setStatus('offline');
      });
      if (!navigator.onLine) {
        this.setStatus('offline');
      }
    }

    // Subscribe to SSE stream for live updates
    this._connectSse();

    // Setup 15s polling fallback
    this._startPolling();

    // Hook into Store updates to auto-push debounced changes
    Store.subscribe(() => {
      this._onStoreMutated();
    });

    // Initial pull on start
    setTimeout(() => {
      this.triggerPull().catch(e => console.error('Initial sync pull failed:', e));
    }, 500);
  }

  public subscribeStatus(cb: SyncStatusListener): () => void {
    this._statusListeners.add(cb);
    cb(this.status, this.lastSyncedAt, this.room);
    return () => this._statusListeners.delete(cb);
  }

  public subscribe(cb: () => void): () => void {
    const listener: SyncStatusListener = () => cb();
    return this.subscribeStatus(listener);
  }

  public getStatus(): { isOnline: boolean; isSyncing: boolean; pendingChangesCount: number } {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    return {
      isOnline: isOnline && this.status !== 'offline',
      isSyncing: this._isSyncing || this.status === 'syncing',
      pendingChangesCount: this.status === 'pending' ? 1 : 0
    };
  }

  public async pushPhoto(id: string, url: string): Promise<boolean> {
    return pushPhotoToCloud(this.room, {
      id,
      url,
      timestamp: new Date().toISOString()
    });
  }

  private setStatus(newStatus: SyncStatus): void {
    this.status = newStatus;
    this._notify();
  }

  private _notify(): void {
    this._statusListeners.forEach(cb => {
      try {
        cb(this.status, this.lastSyncedAt, this.room);
      } catch (e) {
        console.error('SyncStatusListener error:', e);
      }
    });
  }

  private _connectSse(): void {
    if (this._sseUnsubscribe) {
      this._sseUnsubscribe();
    }
    this._sseUnsubscribe = subscribeToLiveCloudStream(this.room, (ping: SyncPing) => {
      this._handleRemotePing(ping);
    });
  }

  private _startPolling(): void {
    if (this._pollIntervalTimer) {
      clearInterval(this._pollIntervalTimer);
    }
    this._pollIntervalTimer = setInterval(() => {
      if (navigator.onLine && !this._isSyncing) {
        this.triggerPull().catch(() => {});
      }
    }, 15000);
  }

  private _handleRemotePing(ping: SyncPing): void {
    // Ignore echos from self
    if (ping.deviceId === this.deviceId) {
      return;
    }
    // Pull immediately upon peer notification
    this.triggerPull().catch(e => console.error('Peer ping pull failed:', e));
  }

  private _onStoreMutated(): void {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.setStatus('offline');
      return;
    }

    this.setStatus('pending');
    clearTimeout(this._pushDebounceTimer);
    this._pushDebounceTimer = setTimeout(() => {
      this.triggerPush().catch(e => console.error('Debounced push failed:', e));
    }, 1200);
  }

  public async changeRoom(newRoom: string): Promise<void> {
    const clean = (newRoom || 'INV-MAIN').trim().toUpperCase();
    this.room = clean;
    persistActiveRoom(clean);
    this._lastPushedTimestamp = '';
    this._lastReceivedTimestamp = '';
    this._connectSse();
    this.setStatus('syncing');
    await this.triggerPull();
  }

  public async triggerPull(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.setStatus('offline');
      return false;
    }

    try {
      this._isSyncing = true;
      const remote = await pullSyncPayload(this.room);

      if (!remote) {
        // Room empty or unreachable, local state remains authoritative
        this.setStatus('synced');
        this._isSyncing = false;
        return true;
      }

      // Ignore echoes if payload identical to last received
      if (remote.updatedAt === this._lastReceivedTimestamp) {
        this.setStatus('synced');
        this._isSyncing = false;
        return true;
      }

      const localPayload = this._buildLocalPayload();
      const merged = mergeSyncPayloads(localPayload, remote);

      this._lastReceivedTimestamp = remote.updatedAt;
      this.lastSyncedAt = new Date();
      this._version = merged.version;

      // Apply merged data to store
      Store.applyLoadedData({
        tools: merged.tools,
        procurementLog: merged.procurementLog,
        personnel: merged.personnel,
        auditLog: merged.auditLog,
        workstations: merged.settings.workstations,
        programs: merged.settings.programs,
        wsProgram: merged.settings.wsProgram,
        workposts: merged.settings.workposts,
      });

      await Store.save();
      this.setStatus('synced');
      this._isSyncing = false;
      return true;
    } catch (err) {
      console.error('Sync pull failed:', err);
      this.setStatus('error');
      this._isSyncing = false;
      return false;
    }
  }

  public async triggerPush(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.setStatus('offline');
      return false;
    }

    try {
      this._isSyncing = true;
      this.setStatus('syncing');

      const payload = this._buildLocalPayload();
      if (payload.updatedAt === this._lastPushedTimestamp) {
        this.setStatus('synced');
        this._isSyncing = false;
        return true;
      }
      this._version += 1;
      payload.version = this._version;
      this._lastPushedTimestamp = payload.updatedAt;

      const ok = await pushSyncPayload(this.room, payload);
      if (ok) {
        this.lastSyncedAt = new Date();
        this.setStatus('synced');
      } else {
        this.setStatus('error');
      }
      this._isSyncing = false;
      return ok;
    } catch (err) {
      console.error('Sync push failed:', err);
      this.setStatus('error');
      this._isSyncing = false;
      return false;
    }
  }

  public async forceSync(): Promise<boolean> {
    this.setStatus('syncing');
    const pulled = await this.triggerPull();
    const pushed = await this.triggerPush();
    return pulled && pushed;
  }

  private _buildLocalPayload(): SyncPayload {
    return {
      tools: Store.tools,
      procurementLog: Store.procurementLog,
      personnel: Store.personnel,
      settings: {
        workstations: Store.workstations,
        workposts: Store.workposts,
        programs: Store.programs,
        wsProgram: Store.wsProgram,
        audits5s: Store.audits5s,
        meta: Store.meta,
      },
      auditLog: Store.auditLog,
      deviceId: this.deviceId,
      updatedAt: new Date().toISOString(),
      version: this._version,
      room: this.room,
    };
  }
}

export const SyncManagerInstance = new SyncManager();
