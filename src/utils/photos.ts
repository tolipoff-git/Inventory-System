// ============================================================================
// 5S Tool Command Center — Photos Utility & Storage
// ============================================================================

import { AppDB } from '../storage/indexedDb';
import { compressImageBase64 } from './canvas';
import { nowISO } from './formatters';
import { Store } from '../storage/store';
import { SyncManagerInstance } from '../sync/syncManager';

export interface PhotoRecord {
  id: string;
  toolId: string;
  ts: string;
  data?: string; // base64 fallback
  blob?: Blob;
  caption?: string;
}

export const Photos = {
  MAX_PER_TOOL: 5,
  MAX_SIDE: 640,
  JPEG_Q: 0.6,

  newId(): string {
    return 'ph_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  },

  async compress(file: File): Promise<string> {
    return compressImageBase64(file, this.MAX_SIDE, this.MAX_SIDE, this.JPEG_Q);
  },

  async attachPhoto(toolId: string, file: File, caption?: string): Promise<PhotoRecord | null> {
    const tool = Store.getTool(toolId);
    if (!tool) return null;

    const dataUrl = await this.compress(file);
    const id = this.newId();
    const ts = nowISO();

    const photoRecord: PhotoRecord = {
      id,
      toolId,
      ts,
      caption: caption || '',
      data: dataUrl
    };

    if (AppDB.isAvailable()) {
      try {
        await AppDB.put(AppDB.STORES.photos, photoRecord);
      } catch (err) {
        console.error('Failed to store photo blob in IndexedDB:', err);
      }
    }

    // Attach to tool photos array
    if (!tool.photos) tool.photos = [];
    tool.photos.push({
      id,
      ts,
      url: dataUrl,
      caption: caption || ''
    } as any);

    // Save tool
    await Store.saveTool(tool);

    // Push photo to Cloudflare Worker distributed storage
    try {
      await SyncManagerInstance.pushPhoto(id, dataUrl);
    } catch (e) {
      console.error('Sync photo push queued or failed:', e);
    }

    return photoRecord;
  },

  async removePhoto(toolId: string, photoIndex: number): Promise<void> {
    const tool = Store.getTool(toolId);
    if (!tool || !tool.photos || !tool.photos[photoIndex]) return;

    const photo = tool.photos[photoIndex];
    tool.photos.splice(photoIndex, 1);
    await Store.saveTool(tool);

    if (photo.id && AppDB.isAvailable()) {
      try {
        await AppDB.delete(AppDB.STORES.photos, photo.id);
      } catch (e) {
        console.error('Failed to delete photo from DB:', e);
      }
    }
  },

  openViewer(imgUrl: string): void {
    const modal = document.getElementById('photoViewerModal');
    const img = document.getElementById('photoViewerImg') as HTMLImageElement;
    if (modal && img) {
      img.src = imgUrl;
      modal.classList.add('active');
    }
  },

  closeViewer(): void {
    const modal = document.getElementById('photoViewerModal');
    if (modal) {
      modal.classList.remove('active');
    }
  }
};
