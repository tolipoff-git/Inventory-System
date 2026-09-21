import { SyncManagerInstance } from '../../../sync/syncManager';
import { getActiveSyncRoom, getSyncToken, setSyncToken } from '../../../sync/syncApi';
import { Store } from '../../../storage/store';
import { renderQrToCanvas } from '../../../labels/qrGenerator';
import { copyText, toast } from '../../../utils/dom';
import { esc } from '../../../utils/formatters';
import { getLanguage, T } from '../../../i18n';

let unsubscribeStatusListener: (() => void) | null = null;

export function renderSyncModalHtml(): string {
  const isRu = getLanguage() === 'RU';
  const currentRoom = getActiveSyncRoom();
  const syncToken = getSyncToken();
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

          <!-- Sync Diagnostics -->
          <div style="background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; font-size: 0.8rem;">
            <div style="font-weight:bold; color: var(--primary-hover); margin-bottom:8px;">
              🔎 ${isRu ? 'Диагностика — сравните значения с телефоном' : 'Diagnostics — compare these values with the phone'}
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 6px 16px;">
              <div>${isRu ? 'Хост синхронизации' : 'Sync host'}: <code id="syncDiagHost" style="color:var(--primary);">—</code></div>
              <div>${isRu ? 'Комната' : 'Room'}: <code id="syncDiagRoom" style="color:var(--primary);">—</code></div>
              <div>${isRu ? 'Токен' : 'Token'}: <span id="syncDiagToken">—</span></div>
              <div>${isRu ? 'Инструментов локально' : 'Tools locally'}: <b id="syncDiagLocal">—</b></div>
              <div>${isRu ? 'Инструментов в облаке' : 'Tools in cloud'}: <b id="syncDiagRemote">—</b></div>
              <div>${isRu ? 'Ревизия в облаке' : 'Cloud revision'}: <span id="syncDiagRevision">—</span></div>
              <div>${isRu ? 'HTTP отправки' : 'Push HTTP'}: <span id="syncDiagPush">—</span></div>
              <div>${isRu ? 'Ошибка' : 'Error'}: <span id="syncDiagError">—</span></div>
            </div>
            <div id="syncDiagWarning" style="display:none; margin-top:8px; color: var(--warning); line-height:1.4;"></div>
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

              <!-- Cloud Sync Bearer Token Form (optional lock) -->
              <form id="syncTokenChangeForm" onsubmit="event.preventDefault(); window.handleSyncTokenChange();" style="margin-top: 4px;">
                <label style="font-size: 0.8rem; font-weight: bold; color: var(--text-muted);">
                  ${isRu ? 'Секретный токен (необязательно):' : 'Cloud Sync Secret (optional):'}
                </label>
                <div style="display:flex; gap:6px; margin-top:4px;">
                  <input id="syncTokenInput" type="password" value="${esc(syncToken)}" style="flex:1; font-size:0.8rem; font-family:monospace; background:rgba(0,0,0,0.4); padding:6px 10px;" placeholder="Bearer Token">
                  <button type="button" id="syncTokenToggleVisBtn" class="btn btn-secondary" style="padding: 6px 10px; font-size:0.8rem;" title="${isRu ? 'Показать / скрыть' : 'Toggle visibility'}">👁</button>
                  <button type="submit" class="btn" style="padding: 6px 14px; font-size:0.8rem;">${isRu ? 'Сохранить' : 'Save'}</button>
                </div>
                <div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">
                  ${isRu
                    ? 'Синхронизация работает без токена. Заполнять нужно только если на Cloudflare Worker задан SYNC_SECRET — тогда одинаковый токен на всех устройствах.'
                    : 'Sync works without a token. Fill this in only if SYNC_SECRET is set on the Cloudflare Worker — then the same token is required on every device.'}
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
  const isRu = () => getLanguage() === 'RU';

  /** Human-readable reason for the last real sync failure. */
  const syncErrorText = (): string => {
    const err = SyncManagerInstance.lastSyncError;
    if (!err) return '';
    if (err === 'unauthorized') {
      return isRu()
        ? '401 — неверный токен синхронизации (Bearer). На обоих устройствах он должен совпадать.'
        : '401 — invalid sync Bearer token. It must match on both devices.';
    }
    if (err === 'unconfigured') {
      return isRu()
        ? '503 — сервер синхронизации недоступен (KV отклонил запись). Попробуйте ещё раз.'
        : '503 — the sync backend rejected the write (KV). Retry.';
    }
    return err;
  };

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
        ? SyncManagerInstance.lastSyncedAt.toLocaleTimeString('en-US')
        : '—';
    }

    // --- Diagnostics -------------------------------------------------------
    const host = SyncManagerInstance.getSyncHost();
    const token = getSyncToken();
    const localTools = Store.tools.length;
    const remoteTools = SyncManagerInstance.lastRemoteToolCount;

    const setText = (id: string, value: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    setText('syncDiagHost', host || 'n/a');
    setText('syncDiagRoom', room);
    setText('syncDiagToken', token ? `••••${token.slice(-4)}` : (isRu() ? 'не задан' : 'not set'));
    setText('syncDiagLocal', String(localTools));
    setText('syncDiagRemote', remoteTools === null ? '—' : String(remoteTools));
    setText(
      'syncDiagRevision',
      SyncManagerInstance.lastRemoteUpdatedAt
        ? new Date(SyncManagerInstance.lastRemoteUpdatedAt).toLocaleTimeString('en-US')
        : '—'
    );
    setText('syncDiagPush', SyncManagerInstance.lastPushStatus === null ? '—' : String(SyncManagerInstance.lastPushStatus));
    setText('syncDiagError', syncErrorText() || '—');

    const warnEl = document.getElementById('syncDiagWarning');
    if (warnEl) {
      const warnings: string[] = [];
      if (!SyncManagerInstance.isPublicOrigin()) {
        warnings.push(
          isRu()
            ? '⚠️ Приложение открыто по локальному адресу. Телефон не сможет попасть в это же хранилище — откройте на ОБОИХ устройствах публичный адрес (https://inventory-system.tolipoff.workers.dev/?room=' + encodeURIComponent(room) + ').'
            : '⚠️ The app is served from a local address. The phone cannot reach the same backend — open the public URL on BOTH devices (https://inventory-system.tolipoff.workers.dev/?room=' + encodeURIComponent(room) + ').'
        );
      }
      if (remoteTools === 0 && localTools > 0) {
        warnings.push(
          isRu()
            ? '⚠️ В облаке 0 инструментов: это устройство ещё не отправляло (нажмите «Отправить») либо второе устройство в другой комнате/на другом хосте.'
            : '⚠️ The cloud holds 0 tools: this device has not pushed yet (press Push) or the other device is in a different room / on a different host.'
        );
      }
      warnEl.style.display = warnings.length ? 'block' : 'none';
      warnEl.innerHTML = warnings.map(esc).join('<br>');
    }

    const statusEl = document.getElementById('syncModalStatusText');
    if (statusEl) {
      const russian = isRu();
      if (!navigator.onLine) {
        statusEl.innerHTML = `🔴 <span>${russian ? 'Офлайн (Локальное хранилище)' : 'Offline (Local Storage)'}</span>`;
      } else if (SyncManagerInstance.status === 'syncing') {
        statusEl.innerHTML = `🟡 <span>${russian ? 'Синхронизация с облаком...' : 'Syncing with cloud...'}</span>`;
      } else if (SyncManagerInstance.status === 'pending') {
        statusEl.innerHTML = `🔵 <span>${russian ? 'Есть локальные изменения' : 'Local changes pending'}</span>`;
      } else if (SyncManagerInstance.status === 'error') {
        statusEl.innerHTML = `🔴 <span>${russian ? 'Ошибка синхронизации — данные НЕ обменяны' : 'Sync error — data NOT exchanged'}</span>`;
      } else {
        statusEl.innerHTML = `🟢 <span>${russian ? 'Синхронизировано с облаком' : 'Fully Synced with Cloud'}</span>`;
      }
    }
  };

  // Bind buttons
  const pullBtn = document.getElementById('syncModalPullBtn');
  if (pullBtn) {
    pullBtn.onclick = async () => {
      pullBtn.setAttribute('disabled', 'true');
      const ok = await SyncManagerInstance.triggerPull();
      pullBtn.removeAttribute('disabled');
      updateModalContent();
      if (ok) {
        toast('✅ ' + T('Synced with cloud'), 'success');
      } else {
        toast('⚠️ ' + (syncErrorText() || T('Sync failed')), 'danger');
      }
    };
  }

  const pushBtn = document.getElementById('syncModalPushBtn');
  if (pushBtn) {
    pushBtn.onclick = async () => {
      pushBtn.setAttribute('disabled', 'true');
      const ok = await SyncManagerInstance.triggerPush();
      pushBtn.removeAttribute('disabled');
      updateModalContent();
      if (ok) {
        toast('✅ ' + T('Pushed to cloud'), 'success');
      } else {
        const status = SyncManagerInstance.lastPushStatus;
        toast('⚠️ ' + (status ? `HTTP ${status}` : (syncErrorText() || T('Sync failed'))), 'danger');
      }
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

  const toggleVisBtn = document.getElementById('syncTokenToggleVisBtn');
  if (toggleVisBtn) {
    toggleVisBtn.onclick = () => {
      const tokenInput = document.getElementById('syncTokenInput') as HTMLInputElement;
      if (tokenInput) {
        tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password';
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

  // Global window handler for sync token change form
  (window as any).handleSyncTokenChange = () => {
    const input = document.getElementById('syncTokenInput') as HTMLInputElement;
    if (!input) return;
    const newToken = input.value.trim();
    if (!newToken) return;
    setSyncToken(newToken);
    toast('🔑 ' + (getLanguage() === 'RU' ? 'Секретный токен синхронизации сохранён' : 'Sync secret token saved'));
  };

  (window as any).openSyncModal = () => {
    SyncModal.open();
  };

  // Sync manager reactive listener updates modal if open
  if (unsubscribeStatusListener) {
    unsubscribeStatusListener();
  }
  unsubscribeStatusListener = SyncManagerInstance.subscribeStatus(() => {
    const modal = document.getElementById('syncModal');
    if (modal && modal.classList.contains('active')) {
      updateModalContent();
    }
  });
}

export const SyncModal = {
  open: () => {
    let modal = document.getElementById('syncModal');
    if (modal) {
      modal.remove();
    }
    document.body.insertAdjacentHTML('beforeend', renderSyncModalHtml());
    initSyncModalLogic();
    modal = document.getElementById('syncModal');
    if (modal) {
      modal.classList.add('active');
    }
  },
  close: () => {
    const modal = document.getElementById('syncModal');
    if (modal) modal.classList.remove('active');
  }
};
