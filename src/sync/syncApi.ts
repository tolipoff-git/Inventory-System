import { SyncPayload, SyncPing, SyncPhoto } from '../types/sync';
import { AbortController } from './abortController';
import { DEFAULT_SYNC_ROOM, DEFAULT_SYNC_SECRET } from '../config/constants';

export function getSyncToken(): string {
  if (typeof window === 'undefined') return DEFAULT_SYNC_SECRET;
  return localStorage.getItem('inv_sync_token') || DEFAULT_SYNC_SECRET;
}

export function setSyncToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('inv_sync_token', token.trim());
}

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let deviceId = localStorage.getItem('inv_device_id');
  if (!deviceId) {
    deviceId = `dev_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
    localStorage.setItem('inv_device_id', deviceId);
  }
  return deviceId;
}

export function getActiveSyncRoom(): string {
  if (typeof window === 'undefined') return DEFAULT_SYNC_ROOM;
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room') || urlParams.get('sync');
  if (roomParam) {
    const clean = roomParam.trim().toUpperCase();
    localStorage.setItem('inv_sync_room', clean);
    return clean;
  }
  return localStorage.getItem('inv_sync_room') || DEFAULT_SYNC_ROOM;
}

export function setActiveSyncRoom(room: string): void {
  if (typeof window === 'undefined') return;
  const clean = (room || DEFAULT_SYNC_ROOM).trim().toUpperCase();
  localStorage.setItem('inv_sync_room', clean);

  // Update URL search query without triggering page reload
  const url = new URL(window.location.href);
  url.searchParams.set('room', clean);
  window.history.replaceState({}, '', url.toString());
}

export function getCloudTopic(room: string): string {
  const clean = (room || DEFAULT_SYNC_ROOM).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
  return `fse_inv_sync_${clean}`;
}

export function getWorkerSyncUrl(room: string): string {
  const clean = (room || DEFAULT_SYNC_ROOM).trim().toUpperCase();
  return `/api/sync/inv_room_${encodeURIComponent(clean)}`;
}

export function isValidPayload(payload: any): payload is SyncPayload {
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    Array.isArray(payload.tools) &&
    payload.deviceId &&
    payload.updatedAt
  );
}

/**
 * Outcome of a pull. The old API returned `null` for *every* failure, so a 401
 * (wrong Bearer token) or a 503 (Worker without `SYNC_SECRET`) was
 * indistinguishable from an empty room — and the UI reported “synced” while
 * nothing was ever exchanged.
 */
export type PullOutcome =
  | { kind: 'ok'; payload: SyncPayload }
  | { kind: 'empty' }
  | { kind: 'unauthorized' }
  | { kind: 'unconfigured' }
  | { kind: 'error'; message: string };

/** Outcome of a push, including the HTTP status for diagnostics. */
export interface PushOutcome {
  ok: boolean;
  status: number;
}

/**
 * Pushes inventory state to Cloudflare Worker API (authoritative KV store),
 * then triggers a lightweight ping broadcast over ntfy.sh relay.
 */
export async function pushSyncPayload(room: string, payload: SyncPayload): Promise<PushOutcome> {
  const cleanRoom = (room || DEFAULT_SYNC_ROOM).trim().toUpperCase();
  const payloadString = JSON.stringify(payload);

  let status = 0;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(getWorkerSyncUrl(cleanRoom), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': payload.deviceId,
        'Authorization': `Bearer ${getSyncToken()}`,
      },
      body: payloadString,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    timeoutId = undefined;
    status = res.status;
  } catch (err) {
    console.error('Sync push to Worker API failed:', err);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }

  // Broadcast a data-free ping to notify peers to pull
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const ping: SyncPing = {
      invSyncPing: true,
      room: cleanRoom,
      deviceId: payload.deviceId,
      updatedAt: payload.updatedAt,
    };

    await fetch(`https://ntfy.sh/${encodeURIComponent(getCloudTopic(cleanRoom))}`, {
      method: 'POST',
      headers: {
        'Title': `5S Tool Sync ${cleanRoom}`,
        'Priority': 'default',
        'X-Device-ID': payload.deviceId,
      },
      body: JSON.stringify(ping),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch {
    // Relay broadcast failed, covered by polling fallback
  }

  return { ok: status >= 200 && status < 300, status };
}

/**
 * Pulls latest room state from the Cloudflare Worker API.
 */
export async function pullSyncPayload(room: string): Promise<PullOutcome> {
  const cleanRoom = (room || DEFAULT_SYNC_ROOM).trim().toUpperCase();

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(`${getWorkerSyncUrl(cleanRoom)}?t=${Date.now()}`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'Authorization': `Bearer ${getSyncToken()}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    timeoutId = undefined;

    if (response.status === 401) return { kind: 'unauthorized' };
    if (response.status === 503) return { kind: 'unconfigured' };
    if (response.status === 404) return { kind: 'empty' };
    if (!response.ok) return { kind: 'error', message: `HTTP ${response.status}` };

    const data = await response.json();
    if (!isValidPayload(data)) return { kind: 'error', message: 'invalid payload' };
    return { kind: 'ok', payload: data };
  } catch (e: any) {
    console.error(`[syncApi:pullSyncPayload] Pull failed for room ${cleanRoom}:`, e);
    return { kind: 'error', message: e?.message || 'network error' };
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

/**
 * Uploads a photo to the Worker API with dedicated KV key photo_<ROOM>_<photoId>.
 */
export async function pushPhotoToCloud(room: string, photo: SyncPhoto): Promise<boolean> {
  const cleanRoom = (room || DEFAULT_SYNC_ROOM).trim().toUpperCase();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(
      `/api/sync/photo_${encodeURIComponent(cleanRoom)}_${encodeURIComponent(photo.id)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getSyncToken()}`,
        },
        body: JSON.stringify(photo),
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetches a single photo from the Worker API.
 */
export async function pullPhotoFromCloud(room: string, photoId: string): Promise<SyncPhoto | null> {
  const cleanRoom = (room || DEFAULT_SYNC_ROOM).trim().toUpperCase();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(
      `/api/sync/photo_${encodeURIComponent(cleanRoom)}_${encodeURIComponent(photoId)}?t=${Date.now()}`,
      {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Authorization': `Bearer ${getSyncToken()}`,
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.id === 'string' && typeof data.url === 'string' && data.url) {
        return data as SyncPhoto;
      }
    }
  } catch (e) {
    console.error(`[syncApi:pullPhotoFromCloud] Failed to fetch photo ${photoId} for room ${cleanRoom}:`, e);
  }
  return null;
}
