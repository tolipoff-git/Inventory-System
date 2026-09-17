// ============================================================================
// 5S Tool Command Center — Header Component
// ============================================================================

import { T, getLanguage } from '../../i18n';
import { CONFIG } from '../../config/constants';
import { Auth } from '../../auth/authManager';
import { SyncManagerInstance } from '../../sync/syncManager';
import { SyncModal } from './Modals/SyncModal';
import { Store } from '../../storage/store';
import { printQueueLabels } from '../../labels/labelPrint';
import { hardReloadPwa } from '../../utils/pwa';

export interface HeaderCallbacks {
    onToggleMode: () => void;
    onToggleTheme: () => void;
    onToggleLanguage: () => void;
    onOpenFaq: () => void;
    onLock: () => void;
    onLoginClick: () => void;
    onOpenSystemMenu: () => void;
    onOpenOpsMenu: () => void;
}

export class HeaderComponent {
    private container: HTMLElement;
    private callbacks: HeaderCallbacks;
    private syncUnsub: (() => void) | null = null;
    private authUnsub: (() => void) | null = null;
    private storeUnsub: (() => void) | null = null;

    constructor(container: HTMLElement, callbacks: HeaderCallbacks) {
        this.container = container;
        this.callbacks = callbacks;
    }

    public render(): void {
        const user = Auth.getCurrentUser();
        const role = Auth.getCurrentRole();
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const langLabel = getLanguage() === 'RU' ? 'RU | ENG' : 'ENG | RU';

        this.container.innerHTML = `
            <div class="header-row">
                <button class="btn" id="modeBtn">🛠 <span id="modeBtnText">${T(document.body.classList.contains('work-mode') ? 'Dashboard' : 'Work Mode')}</span></button>
                <button class="btn btn-warning" id="themeToggleBtn" style="font-weight:bold;">${isLight ? '🌙 Dark' : '☀️ Light'}</button>
                <button class="btn btn-warning" id="langToggleBtn">🌐 <span id="langBtnText">${langLabel}</span></button>
                <button class="btn btn-muted" id="syncStatusBtn" title="Sync Status & Relay Pairing">
                    <span id="syncPulseDot" style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#00e5ff; margin-right:6px;"></span>
                    <span id="syncBtnLabel">Sync</span>
                </button>
                <button class="btn btn-secondary" id="headerQueueBtn" title="Print Queued Labels" style="${(Store.labelQueue?.length || 0) > 0 ? '' : 'display:none;'}">
                    🏷 <span id="headerQueueBadge">${Store.labelQueue?.length || 0}</span>
                </button>

                <div class="header-title-block">
                    <h1 class="header-title">
                        <span>${T('Dashboard')}</span>
                        <sup id="appVersionTag" title="Click to force reload/update PWA" style="font-size:12px; color:var(--text-muted); font-weight:normal; user-select:none; cursor:pointer;">${CONFIG.APP_VERSION}</sup>
                    </h1>
                    <div class="header-subtitle">${T('Tools Inventory')}</div>
                    <div class="brand-credit"><b>Igor Tolipov</b> <i>by Design</i></div>
                </div>

                <button class="btn" id="faqBtn">❓ <span>${T('FAQ_BTN')}</span></button>
                <button class="btn btn-muted" id="lockBtn" title="Lock System">🔒 ${T('Lock')}</button>

                <div class="auth-status" id="authStatusBtn" title="Click to login / logout">
                    <span>${T('Logged in as:')}</span>
                    <span class="user" id="currentUser">${user || 'Guest'}</span>
                    [<span id="currentRole">${role}</span>]
                    (<span class="logout">${T('Logout')}</span>)
                </div>
            </div>

            <div class="toolbar" style="margin-top:10px;">
                <button class="btn" id="sysMenuBtn">⚙ <span>${T('System Management')}</span></button>
                <button class="btn btn-warning" id="opsMenuBtn">🎛 <span>${T('Operations & Reports')}</span></button>
            </div>

            <div class="storage-note" style="margin-top:8px;">
                <strong>${T('Local Storage:')}</strong>
                <span>${T('STORAGE_NOTE')}</span>
            </div>
        `;

        this.bindEvents();
        this.updateSyncStatus();
        this.updateQueueDisplay();

        // Listen for sync status changes
        if (this.syncUnsub) this.syncUnsub();
        this.syncUnsub = SyncManagerInstance.subscribe(() => {
            this.updateSyncStatus();
        });

        // Listen for auth changes
        if (this.authUnsub) this.authUnsub();
        this.authUnsub = Auth.subscribe(() => {
            this.updateAuthDisplay();
        });

        // Listen for store changes (label queue updates)
        if (this.storeUnsub) this.storeUnsub();
        this.storeUnsub = Store.subscribe(() => {
            this.updateQueueDisplay();
        });
    }

    private bindEvents(): void {
        const modeBtn = this.container.querySelector('#modeBtn');
        if (modeBtn) modeBtn.addEventListener('click', () => this.callbacks.onToggleMode());

        const themeBtn = this.container.querySelector('#themeToggleBtn');
        if (themeBtn) themeBtn.addEventListener('click', () => this.callbacks.onToggleTheme());

        const langBtn = this.container.querySelector('#langToggleBtn');
        if (langBtn) langBtn.addEventListener('click', () => this.callbacks.onToggleLanguage());

        const syncBtn = this.container.querySelector('#syncStatusBtn');
        if (syncBtn) syncBtn.addEventListener('click', () => SyncModal.open());

        const qBtn = this.container.querySelector('#headerQueueBtn');
        if (qBtn) {
            qBtn.addEventListener('click', () => printQueueLabels());
        }

        const faqBtn = this.container.querySelector('#faqBtn');
        if (faqBtn) faqBtn.addEventListener('click', () => this.callbacks.onOpenFaq());

        const lockBtn = this.container.querySelector('#lockBtn');
        if (lockBtn) lockBtn.addEventListener('click', () => this.callbacks.onLock());

        const authBtn = this.container.querySelector('#authStatusBtn');
        if (authBtn) authBtn.addEventListener('click', () => this.callbacks.onLoginClick());

        const sysBtn = this.container.querySelector('#sysMenuBtn');
        if (sysBtn) {
            sysBtn.addEventListener('click', () => this.callbacks.onOpenSystemMenu());
        }

        const opsBtn = this.container.querySelector('#opsMenuBtn');
        if (opsBtn) {
            opsBtn.addEventListener('click', () => this.callbacks.onOpenOpsMenu());
        }

        const verTag = this.container.querySelector('#appVersionTag');
        if (verTag) {
            verTag.addEventListener('click', () => {
                if (window.confirm(T('FORCE_REFRESH_CONFIRM'))) {
                    hardReloadPwa();
                }
            });
        }
    }

    public updateAuthDisplay(): void {
        const user = Auth.getCurrentUser();
        const role = Auth.getCurrentRole();
        const userEl = this.container.querySelector('#currentUser');
        const roleEl = this.container.querySelector('#currentRole');
        if (userEl) userEl.textContent = user || 'Guest';
        if (roleEl) roleEl.textContent = role;
    }

    public updateQueueDisplay(): void {
        const qBtn = this.container.querySelector<HTMLElement>('#headerQueueBtn');
        const badge = this.container.querySelector<HTMLElement>('#headerQueueBadge');
        const count = Store.labelQueue?.length || 0;
        if (badge) badge.textContent = String(count);
        if (qBtn) {
            qBtn.style.display = count > 0 ? '' : 'none';
        }
    }

    public updateSyncStatus(): void {
        const status = SyncManagerInstance.getStatus();
        const dot = this.container.querySelector<HTMLElement>('#syncPulseDot');
        const label = this.container.querySelector<HTMLElement>('#syncBtnLabel');
        if (!dot || !label) return;

        if (status.isOnline) {
            if (status.isSyncing) {
                dot.style.background = '#ffd600'; // Yellow
                label.textContent = 'Syncing…';
            } else if (status.pendingChangesCount > 0) {
                dot.style.background = '#00e5ff'; // Cyan
                label.textContent = `Pending (${status.pendingChangesCount})`;
            } else {
                dot.style.background = '#00e676'; // Green
                label.textContent = 'Synced';
            }
        } else {
            dot.style.background = '#ff1744'; // Red
            label.textContent = 'Offline';
        }
    }

    public destroy(): void {
        if (this.syncUnsub) this.syncUnsub();
        if (this.authUnsub) this.authUnsub();
        if (this.storeUnsub) this.storeUnsub();
    }
}
