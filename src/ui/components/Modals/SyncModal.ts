import { SyncManagerInstance } from '../../../sync/syncManager';
import { getActiveSyncRoom } from '../../../sync/syncApi';
import { renderQrToCanvas } from '../../../labels/qrGenerator';
import { copyText, toast } from '../../../utils/dom';
import { esc } from '../../../utils/formatters';
import { getLanguage, T } from '../../../i18n';

export function renderSyncModalHtml(): string {
  const isRu = getLanguage() === 'RU';
  const currentRoom = getActiveSyncRoom();
  const deviceId = SyncManagerInstance.deviceId;

  return `
    <div id="syncModal" class="modal-overlay" onclick="if(event.target===this) window.closeModal('syncModal')">
      <div class="modal" style="max-width: 680px; width: 95%;">
        <!-- Modal Header -->
        <div class="modal-header" style="border-bottom: 1px solid var(--border); padding-bottom: 12px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size: 1.4rem;">☁️</span>
            <div>
              <h3 style="margin:0; font-size:1.15rem; color:var(--primary-hover); display:flex; align-items:center; gap:8px;">
                <span>${isRu ? 'Онлайн-синхронизация (Cloud Sync)' : 'Cloud Live Synchronization'}</span>
                <span id="syncLivePulse" style="font-size: 10px; padding: 2px 8px; border-radius: 12px; background: rgba(46, 230, 176, 0.15); border: 1px solid rgba(46, 230, 176, 0.4); color: var(--success); font-weight: bold;">
                  ● LIVE RELAY
                </span>
              </h3>
              <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
                ${isRu ? 'Мгновенный обмен данными между складом и цехом' : 'Real-time multi-device sync via Cloudflare KV & SSE Ping Relay'}
              </div>
            </div>
          </div>
          <button class="btn btn-muted" onclick="window.closeModal('syncModal')" style="padding: 4px 10px;">✕</button>
        </div>

        <div class="modal-body" style="padding: 16px 0; display:flex; flex-direction:column; gap:16px;">
          <!-- Status Banner -->
          <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; padding: 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <div id="syncModalStatusText" style="font-size: 0.95rem; font-weight: bold; color: var(--text-main); display:flex; align-items:center; gap:8px;">
                🟢 <span>${isRu ? 'Синхронизировано с облаком' : 'Fully Synced with Cloud'}</span>
              </div>
              <div id="syncModalTimeText" style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;">
                ${isRu ? 'Последняя синхронизация:' : 'Last synced:'} <span id="syncModalLastTime">—</span>
              </div>
            </div>

            <div style="display:flex; gap: 8px;">
              <button id="syncModalPullBtn" class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.85rem;">
                ⬇ ${isRu ? 'Получить (Pull)' : 'Pull Latest'}
              </button>
              <button id="syncModalPushBtn" class="btn" style="padding: 6px 14px; font-size: 0.85rem; font-weight: bold;">
                ⬆ ${isRu ? 'Отправить (Push)' : 'Force Push'}
              </button>
            </div>
          </div>

          <!-- Pairing & QR Code Section -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; align-items: center; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px; padding: 16px;">
            <div style="display: flex; flex-direction: column; align-items: center; text-align: center;">
              <div style="padding: 8px; background: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
                <canvas id="syncRoomQrCanvas" width="160" height="160" style="display:block;"></canvas>
              </div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 8px;">
                📱 ${isRu ? 'Отсканируйте камерой телефона для подключения' : 'Scan with phone camera to connect'}
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 10px;">
              <div>
                <label style="font-size: 0.8rem; font-weight: bold; color: var(--text-muted);">${isRu ? 'Ссылка синхронизации комнаты:' : 'Room Sync URL:'}</label>
                <div style="display:flex; gap:6px; margin-top:4px;">
                  <input id="syncRoomUrlInput" type="text" readonly style="flex:1; font-size:0.8rem; background:rgba(0,0,0,0.4); padding:6px 10px;" />
                  <button id="syncCopyUrlBtn" class="btn btn-secondary" style="padding: 6px 12px; font-size:0.8rem;">📋 ${isRu ? 'Копия' : 'Copy'}</button>
                </div>
              </div>

              <!-- Active Room Selector Form -->
              <form id="syncRoomChangeForm" onsubmit="event.preventDefault(); window.handleSyncRoomChange();" style="margin-top: 4px;">
                <label style="font-size: 0.8rem; font-weight: bold; color: var(--text-muted);">${isRu ? 'Рабочая комната синхронизации:' : 'Active Sync Room:'}</label>
                <div style="display:flex; gap:6px; margin-top:4px;">
                  <input id="syncRoomInput" type="text" value="${esc(currentRoom)}" style="flex:1; font-size:0.85rem; text-transform:uppercase; font-family:monospace; font-weight:bold;" required />
                  <button type="submit" class="btn" style="padding: 6px 14px; font-size:0.8rem;">${isRu ? 'Сохранить' : 'Switch'}</button>
                </div>
              </form>

              <div style="font-size: 0.75rem; color: var(--text-muted); border-top: 1px dashed var(--border); padding-top: 8px;">
                🔑 <strong>${isRu ? 'ID этого устройства:' : 'This Device ID:'}</strong> <code style="font-size:0.75rem; color:var(--primary);">${esc(deviceId)}</code>
              </div>
            </div>
          </div>

          <!-- Privacy & Zero-Leakage Guarantee -->
          <div style="background: rgba(143, 195, 232, 0.05); border: 1px solid rgba(143, 195, 232, 0.2); border-radius: 6px; padding: 10px 14px; font-size: 0.78rem; color: var(--text-muted); line-height: 1.4;">
            🔒 <strong>${isRu ? 'Принцип нулевой утечки данных (Zero-Data Relay):' : 'Zero-Data Relay Privacy Guarantee:'}</strong>
            ${isRu
              ? 'Через публичный канал ntfy.sh передаются исключительно сигнальные пинги без данных. Все остатки, инструменты и заявки хранятся в защищённом хранилище Cloudflare KV.'
              : 'Public ntfy.sh channels carry only data-free ping signals. Full inventory states and purchase logs are encrypted in transit and stored securely in Cloudflare KV.'}
          </div>
        </div>

        <div class="modal-footer" style="border-top: 1px solid var(--border); padding-top: 12px;">
          <button class="btn btn-muted" onclick="window.closeModal('syncModal')">${T('Close')}</button>
        </div>
      </div>
    </div>
  `;
}

export function initSyncModalLogic(): void {
  const updateModalContent = () => {
    const room = SyncManagerInstance.room;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const fullSyncUrl = `${origin}/?room=${encodeURIComponent(room)}`;

    const urlInput = document.getElementById('syncRoomUrlInput') as HTMLInputElement;
    if (urlInput) urlInput.value = fullSyncUrl;

    const canvas = document.getElementById('syncRoomQrCanvas') as HTMLCanvasElement;
    if (canvas) {
      renderQrToCanvas(canvas, fullSyncUrl, 160).catch(() => {});
    }

    const timeSpan = document.getElementById('syncModalLastTime');
    if (timeSpan) {
      timeSpan.innerText = SyncManagerInstance.lastSyncedAt
        ? SyncManagerInstance.lastSyncedAt.toLocaleTimeString()
        : '—';
    }

    const statusEl = document.getElementById('syncModalStatusText');
    if (statusEl) {
      const isRu = getLanguage() === 'RU';
      if (!navigator.onLine) {
        statusEl.innerHTML = `🔴 <span>${isRu ? 'Офлайн (Локальное хранилище)' : 'Offline (Local Storage)'}</span>`;
      } else if (SyncManagerInstance.status === 'syncing') {
        statusEl.innerHTML = `🟡 <span>${isRu ? 'Синхронизация с облаком...' : 'Syncing with cloud...'}</span>`;
      } else if (SyncManagerInstance.status === 'pending') {
        statusEl.innerHTML = `🔵 <span>${isRu ? 'Есть локальные изменения' : 'Local changes pending'}</span>`;
      } else {
        statusEl.innerHTML = `🟢 <span>${isRu ? 'Синхронизировано с облаком' : 'Fully Synced with Cloud'}</span>`;
      }
    }
  };

  // Bind buttons
  const pullBtn = document.getElementById('syncModalPullBtn');
  if (pullBtn) {
    pullBtn.onclick = async () => {
      pullBtn.setAttribute('disabled', 'true');
      await SyncManagerInstance.triggerPull();
      pullBtn.removeAttribute('disabled');
      updateModalContent();
      toast('✅ ' + T('Synced with cloud'));
    };
  }

  const pushBtn = document.getElementById('syncModalPushBtn');
  if (pushBtn) {
    pushBtn.onclick = async () => {
      pushBtn.setAttribute('disabled', 'true');
      await SyncManagerInstance.triggerPush();
      pushBtn.removeAttribute('disabled');
      updateModalContent();
      toast('✅ ' + T('Pushed to cloud'));
    };
  }

  const copyBtn = document.getElementById('syncCopyUrlBtn');
  if (copyBtn) {
    copyBtn.onclick = () => {
      const urlInput = document.getElementById('syncRoomUrlInput') as HTMLInputElement;
      if (urlInput && urlInput.value) {
        copyText(urlInput.value);
      }
    };
  }

  // Global window handler for room change form
  (window as any).handleSyncRoomChange = async () => {
    const input = document.getElementById('syncRoomInput') as HTMLInputElement;
    if (!input || !input.value.trim()) return;
    const newRoom = input.value.trim().toUpperCase();
    await SyncManagerInstance.changeRoom(newRoom);
    updateModalContent();
    toast(`☁️ Room switched to: ${newRoom}`);
  };

  (window as any).openSyncModal = () => {
    const modal = document.getElementById('syncModal');
    if (modal) {
      modal.classList.add('active');
      updateModalContent();
    }
  };

  // Sync manager reactive listener updates modal if open
  SyncManagerInstance.subscribeStatus(() => {
    const modal = document.getElementById('syncModal');
    if (modal && modal.classList.contains('active')) {
      updateModalContent();
    }
  });
}

export const SyncModal = {
  open: () => {
    let modal = document.getElementById('syncModal');
    if (!modal) {
      document.body.insertAdjacentHTML('beforeend', renderSyncModalHtml());
      initSyncModalLogic();
      modal = document.getElementById('syncModal');
    }
    if (modal) {
      modal.classList.add('active');
      const input = document.getElementById('syncRoomInput') as HTMLInputElement;
      if (input) input.value = SyncManagerInstance.room;
    }
  },
  close: () => {
    const modal = document.getElementById('syncModal');
    if (modal) modal.classList.remove('active');
  }
};
