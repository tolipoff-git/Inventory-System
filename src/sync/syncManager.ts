import { SyncStatus, SyncPayload, SyncPing } from '../types/sync';
import {
  getOrCreateDeviceId,
  getActiveSyncRoom,
  setActiveSyncRoom as persistActiveRoom,
  pushSyncPayload,
  pullSyncPayload,
  pushPhotoToCloud,
} from './syncApi';
import { subscribeToLiveCloudStream, broadcastPing } from './liveRelay';
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
  /**
   * True while a remote payload is being written into the Store. Suppresses the
   * auto-push that `Store.save()` would otherwise schedule, which would echo the
   * just-pulled revision straight back to the relay.
   */
  private _applyingRemote: boolean = false;
  private _lastPushedTimestamp: string = '';
  private _lastReceivedTimestamp: string = '';
  private _version: number = 1;
  /** In-flight push, so a debounce timer and a manual click cannot race. */
  private _pushPromise: Promise<boolean> | null = null;

  /**
   * Diagnostics surfaced in the Sync modal. `lastSyncError` is set whenever a
   * pull/push actually failed, so the UI can stop claiming “synced” on a 401.
   */
  public lastSyncError: string | null = null;
  public lastRemoteToolCount: number | null = null;
  public lastRemoteUpdatedAt: string | null = null;
  public lastPushStatus: number | null = null;

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

      // Phones suspend timers and the SSE stream while backgrounded, so a pull on
      // every return-to-foreground keeps the two devices converged without
      // waiting for the 15s poll.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          this.triggerPull().catch(() => {});
        }
      });
      window.addEventListener('focus', () => {
        if (navigator.onLine) this.triggerPull().catch(() => {});
      });
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
    if (this._applyingRemote) return;
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
      const outcome = await pullSyncPayload(this.room);

      // Surface real failures instead of pretending the room is simply empty.
      if (outcome.kind === 'unauthorized') {
        this.lastSyncError = 'unauthorized';
        this.setStatus('error');
        this._isSyncing = false;
        return false;
      }
      if (outcome.kind === 'unconfigured') {
        this.lastSyncError = 'unconfigured';
        this.setStatus('error');
        this._isSyncing = false;
        return false;
      }
      if (outcome.kind === 'error') {
        this.lastSyncError = outcome.message;
        this.setStatus('error');
        this._isSyncing = false;
        return false;
      }
      if (outcome.kind === 'empty') {
        // Room exists but holds no revision yet — nothing to pull.
        this.lastSyncError = null;
        this.lastRemoteToolCount = 0;
        this.lastRemoteUpdatedAt = null;
        this.setStatus('synced');
        this._isSyncing = false;
        return true;
      }

      const remote = outcome.payload;
      this.lastSyncError = null;
      this.lastRemoteToolCount = Array.isArray(remote.tools) ? remote.tools.length : 0;
      this.lastRemoteUpdatedAt = remote.updatedAt || null;

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
      this._applyingRemote = true;
      try {
        Store.applyLoadedData({
          tools: merged.tools,
          procurementLog: merged.procurementLog,
          personnel: merged.personnel,
          auditLog: merged.auditLog,
          workstations: merged.settings.workstations,
          programs: merged.settings.programs,
          wsProgram: merged.settings.wsProgram,
          workposts: merged.settings.workposts,
          registryEvents: merged.settings.registryEvents,
          sops: merged.settings.sops,
          audits5s: merged.settings.audits5s,
          meta: merged.settings.meta,
        });

        await Store.save();
      } finally {
        this._applyingRemote = false;
      }
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
    // Coalesce concurrent pushes (debounce timer + manual button).
    if (this._pushPromise) return this._pushPromise;
    this._pushPromise = this._doPush();
    try {
      return await this._pushPromise;
    } finally {
      this._pushPromise = null;
    }
  }

  private async _doPush(): Promise<boolean> {
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

      const pushOutcome = await pushSyncPayload(this.room, payload);
      this.lastPushStatus = pushOutcome.status;
      const ok = pushOutcome.ok;
      if (ok) {
        this.lastSyncError = null;
        this.lastSyncedAt = new Date();
        this.setStatus('synced');
        // Announce the new revision on the public relay so peers pull immediately
        // instead of waiting for the 15s polling fallback.
        broadcastPing(this.room, this.deviceId, payload.updatedAt).catch(() => {});
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

  /** Host the sync API is served from — the sync backend is whatever origin the
   *  app was loaded from, so two devices on different hosts never exchange data. */
  public getSyncHost(): string {
    try {
      return typeof window !== 'undefined' ? window.location.host : 'n/a';
    } catch {
      return 'n/a';
    }
  }

  /**
   * False when the app is served from localhost / a private LAN address. The
   * pairing QR and room URL then point at an address a phone cannot reach, which
   * silently produces two isolated sync backends.
   */
  public isPublicOrigin(): boolean {
    try {
      const host = window.location.hostname;
      if (!host) return false;
      if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return false;
      if (/^10\./.test(host) || /^192\.168\./.test(host)) return false;
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
      if (/^169\.254\./.test(host)) return false;
      return host.includes('.');
    } catch {
      return false;
    }
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
        registryEvents: Store.registryEvents,
        sops: Store.sops,
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
