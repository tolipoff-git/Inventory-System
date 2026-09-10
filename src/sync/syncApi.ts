import { SyncPayload, SyncPing, SyncPhoto } from '../types/sync';
import { DEFAULT_SYNC_ROOM } from '../config/constants';

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
 * Pushes inventory state to Cloudflare Worker API (authoritative KV store),
 * then triggers a lightweight ping broadcast over ntfy.sh relay.
 */
export async function pushSyncPayload(room: string, payload: SyncPayload): Promise<boolean> {
  const cleanRoom = (room || DEFAULT_SYNC_ROOM).trim().toUpperCase();
  const payloadString = JSON.stringify(payload);

  let workerOk = false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(getWorkerSyncUrl(cleanRoom), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': payload.deviceId,
      },
      body: payloadString,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    workerOk = res.ok;
  } catch (err) {
    console.warn('Sync push to Worker API failed:', err);
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

  return workerOk;
}

/**
 * Pulls latest room state from the Cloudflare Worker API.
 */
export async function pullSyncPayload(room: string): Promise<SyncPayload | null> {
  const cleanRoom = (room || DEFAULT_SYNC_ROOM).trim().toUpperCase();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${getWorkerSyncUrl(cleanRoom)}?t=${Date.now()}`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (isValidPayload(data)) {
        return data;
      }
    }
  } catch {}

  return null;
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
        headers: { 'Content-Type': 'application/json' },
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
      { method: 'GET', headers: { 'Cache-Control': 'no-cache' }, signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.id === 'string' && typeof data.url === 'string' && data.url) {
        return data as SyncPhoto;
      }
    }
  } catch {}
  return null;
}
