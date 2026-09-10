import { SyncPing } from '../types/sync';
import { DEFAULT_SYNC_ROOM } from '../config/constants';
import { getCloudTopic } from './syncApi';

export function subscribeToLiveCloudStream(
  room: string,
  onPing: (ping: SyncPing) => void
): () => void {
  if (typeof window === 'undefined' || !window.EventSource) {
    return () => {};
  }

  const cleanRoom = (room || DEFAULT_SYNC_ROOM).trim().toUpperCase();
  const topic = getCloudTopic(cleanRoom);
  let eventSource: EventSource | null = null;

  try {
    eventSource = new EventSource(`https://ntfy.sh/${encodeURIComponent(topic)}/sse`);

    eventSource.onmessage = (event) => {
      try {
        if (!event.data) return;
        const parsed = JSON.parse(event.data);
        if (parsed.event !== 'message' || !parsed.message) return;
        const ping = JSON.parse(parsed.message);
        // Ensure ping conforms to protocol and matches the room
        if (ping && ping.invSyncPing === true && ping.room === cleanRoom && ping.deviceId) {
          onPing(ping as SyncPing);
        }
      } catch {
        // Non-ping message on public relay ignored
      }
    };

    eventSource.onerror = () => {
      // EventSource automatically reconnects with backoff
    };
  } catch (err) {
    console.warn('SSE stream error:', err);
  }

  return () => {
    if (eventSource) {
      eventSource.close();
    }
  };
}

export async function broadcastPing(room: string, deviceId: string, updatedAt: string): Promise<void> {
  const cleanRoom = (room || DEFAULT_SYNC_ROOM).trim().toUpperCase();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const ping: SyncPing = {
      invSyncPing: true,
      room: cleanRoom,
      deviceId,
      updatedAt,
    };

    await fetch(`https://ntfy.sh/${encodeURIComponent(getCloudTopic(cleanRoom))}`, {
      method: 'POST',
      headers: {
        'Title': `5S Tool Sync ${cleanRoom}`,
        'Priority': 'default',
        'X-Device-ID': deviceId,
      },
      body: JSON.stringify(ping),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch {}
}
