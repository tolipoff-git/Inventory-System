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
import { AppDB, DBState } from '../storage/indexedDb';

export type SyncStatusListener = (status: SyncStatus, lastSynced: Date | null, room: string) => void;

class SyncManager {
  public status: SyncStatus = 'synced';
  public lastSyncedAt: Date | null = null;
  public room: string = getActiveSyncRoom();
  public deviceId: string = getOrCreateDeviceId();

  private _statusListeners: Set<SyncStatusListener> = new Set();
  private _sseUnsubscribe: (() => void) | null = null;
  private _pushDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  private _pollIntervalTimer: ReturnType<typeof setInterval> | undefined;
  private _isSyncing: boolean = false;
  /**
   * True while a remote payload is being written into the Store. Suppresses the
   * auto-push that `Store.save()` would otherwise schedule, which would echo the
   * just-pulled revision straight back to the relay.
   */
  private _applyingRemote: boolean = false;
  private _lastReceivedTimestamp: string = '';
  private _version: number = 1;
  /** In-flight push, so a debounce timer and a manual click cannot race. */
  private _pushPromise: Promise<boolean> | null = null;
  private _roomEpoch = 0;
  private _changingRoom = false;
  private _pullSequence = 0;
  private _mutationVersion = 0;
  private _dirty = false;
  private _retryTimer: ReturnType<typeof setTimeout> | undefined;

  private markDirty(dirty: boolean): void {
    this._dirty = dirty;
    try { localStorage.setItem(`inv_sync_dirty_${this.room}`, dirty ? '1' : '0'); }
    catch { /* Sync metadata unavailable; inventory remains in IndexedDB. */ }
  }

  private schedulePush(delay = 1200): void {
    if (this._pushDebounceTimer !== undefined) clearTimeout(this._pushDebounceTimer);
    this._pushDebounceTimer = setTimeout(() => {
      this._pushDebounceTimer = undefined;
      this.triggerPush().catch(error => console.error('Queued push failed', error));
    }, delay);
  }

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
    this._dirty = localStorage.getItem(`inv_sync_dirty_${this.room}`) === '1';

    // Listen to network status
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.setStatus('pending');
        this.forceSync().catch(e => console.error('Online sync failed:', e));
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
    this._mutationVersion++;
    this.markDirty(true);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.setStatus('offline');
      return;
    }

    this.setStatus('pending');
    this.schedulePush();
  }

  public async changeRoom(newRoom: string): Promise<void> {
    const clean = newRoom.trim().toUpperCase();
    if (!clean || clean === this.room) return;
    if (this._changingRoom) throw new Error('Room switch already in progress');
    this._changingRoom = true;
    const oldRoom = this.room;
    const before = structuredClone(Store.getStateSnapshot());
    const oldDirty = this._dirty;
    const epoch = ++this._roomEpoch;
    if (this._pushDebounceTimer !== undefined) clearTimeout(this._pushDebounceTimer);
    if (this._retryTimer !== undefined) clearTimeout(this._retryTimer);
    this.setStatus('syncing');
    try {
      // Keep each room's unsent state recoverable; never merge the departing room into the target.
      await AppDB.setSetting(`sync_room_${oldRoom}`, { state: before, dirty: oldDirty });
      const cached = await AppDB.getSetting<{ state: DBState; dirty: boolean }>(`sync_room_${clean}`);
      const outcome = await pullSyncPayload(clean);
      if (epoch !== this._roomEpoch) return;
      if (outcome.kind !== 'ok' && outcome.kind !== 'empty') throw new Error('Target room unavailable');
      const empty: SyncPayload = {
        tools: [], personnel: [], procurementLog: [], auditLog: [],
        settings: { workstations: [], workposts: [], programs: [], wsProgram: {}, registryEvents: {}, sops: [], audits5s: [], meta: {} },
        deviceId: this.deviceId, updatedAt: '', version: 1, room: clean,
      };
      const remote = outcome.kind === 'ok' ? outcome.payload : empty;
      const local: SyncPayload = cached ? {
        tools: cached.state.tools, personnel: cached.state.personnel, procurementLog: cached.state.procurementLog,
        auditLog: cached.state.auditLog, settings: cached.state, deviceId: this.deviceId, updatedAt: '', version: 1, room: clean,
      } : empty;
      const target = cached ? mergeSyncPayloads(local, remote) : remote;
      this._applyingRemote = true;
      try {
        Store.applyLoadedData({
          tools: target.tools, personnel: target.personnel, procurementLog: target.procurementLog, auditLog: target.auditLog,
          workstations: target.settings.workstations, workposts: target.settings.workposts,
          programs: target.settings.programs, wsProgram: target.settings.wsProgram,
          registryEvents: target.settings.registryEvents, sops: target.settings.sops,
          audits5s: target.settings.audits5s, meta: target.settings.meta,
          users: before.users, labelQueue: cached?.state.labelQueue || [], rollback: cached?.state.rollback || null,
        });
        await Store.save();
      } finally { this._applyingRemote = false; }
      this.room = clean;
      persistActiveRoom(clean);
      this._lastReceivedTimestamp = remote.updatedAt;
      this._isSyncing = false;
      this._version = target.version;
      this.markDirty(cached?.dirty || false);
      this._connectSse();
      this.setStatus(this._dirty ? 'pending' : 'synced');
      if (this._dirty) this.schedulePush();
    } catch (error) {
      if (epoch === this._roomEpoch) {
        Store.applyLoadedData(before);
        this.room = oldRoom;
        this.markDirty(oldDirty);
        this.lastSyncError = error instanceof Error ? error.message : 'Room switch failed';
        this.setStatus('error');
      }
      throw error;
    } finally { this._changingRoom = false; this._isSyncing = false; }
  }

  public async triggerPull(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.setStatus('offline');
      return false;
    }

    const epoch = this._roomEpoch;
    const room = this.room;
    const sequence = ++this._pullSequence;
    try {
      this._isSyncing = true;
      const outcome = await pullSyncPayload(room);
      if (epoch !== this._roomEpoch || room !== this.room || sequence !== this._pullSequence) return false;

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
        this.setStatus(this._dirty ? 'pending' : 'synced');
        if (this._dirty) this.schedulePush();
        this._isSyncing = false;
        return true;
      }

      const remote = outcome.payload;
      this.lastSyncError = null;
      this.lastRemoteToolCount = Array.isArray(remote.tools) ? remote.tools.length : 0;
      this.lastRemoteUpdatedAt = remote.updatedAt || null;

      // Ignore echoes if payload identical to last received
      if (remote.updatedAt === this._lastReceivedTimestamp) {
        this.setStatus(this._dirty ? 'pending' : 'synced');
        if (this._dirty) this.schedulePush();
        this._isSyncing = false;
        return true;
      }

      const localPayload = this._buildLocalPayload();
      const merged = mergeSyncPayloads(localPayload, remote);

      this.lastSyncedAt = new Date();
      this._version = merged.version;

      // Apply merged data to store
      this._applyingRemote = true;
      try {
        const localState = Store.getStateSnapshot();
        Store.applyLoadedData({
          users: localState.users, labelQueue: localState.labelQueue, rollback: localState.rollback,
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
      if (epoch !== this._roomEpoch) return false;
      this._lastReceivedTimestamp = remote.updatedAt;
      this.setStatus(this._dirty ? 'pending' : 'synced');
      if (this._dirty) this.schedulePush();
      this._isSyncing = false;
      return true;
    } catch (err) {
      if (epoch !== this._roomEpoch) return false;
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
      if (this._dirty && this.status === 'pending') this.schedulePush();
    }
  }

  private async _doPush(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.markDirty(true);
      this.setStatus('offline');
      return false;
    }
    const epoch = this._roomEpoch;
    const room = this.room;
    const revision = this._mutationVersion;
    this.markDirty(true);
    try {
      this._isSyncing = true;
      this.setStatus('syncing');
      if (!await this.triggerPull()) throw new Error('Pull before push failed');
      if (epoch !== this._roomEpoch || room !== this.room) return false;
      const payload = structuredClone(this._buildLocalPayload());
      payload.version = ++this._version;
      const outcome = await pushSyncPayload(room, payload);
      if (epoch !== this._roomEpoch || room !== this.room) return false;
      this.lastPushStatus = outcome.status;
      if (outcome.ok) {
        this.lastSyncError = null;
        this.lastSyncedAt = new Date();
        this.markDirty(revision !== this._mutationVersion);
        this.setStatus(this._dirty ? 'pending' : 'synced');
        broadcastPing(room, this.deviceId, payload.updatedAt).catch(() => {});
      } else {
        this.lastSyncError = `HTTP ${outcome.status}`;
        this.setStatus('error');
        this._retryTimer = setTimeout(() => this.schedulePush(0), 15000);
      }
      this._isSyncing = false;
      return outcome.ok;
    } catch (error) {
      if (epoch !== this._roomEpoch) return false;
      this.lastSyncError = error instanceof Error ? error.message : 'Push failed';
      this.setStatus('error');
      this._isSyncing = false;
      this._retryTimer = setTimeout(() => this.schedulePush(0), 15000);
      return false;
    }
  }

  public async forceSync(): Promise<boolean> {
    this.setStatus('syncing');
    const pulled = await this.triggerPull();
    if (!pulled) return false;
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
