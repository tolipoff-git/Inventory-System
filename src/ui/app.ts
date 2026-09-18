// ============================================================================
// 5S Tool Command Center — Main Application UI Orchestrator
// ============================================================================

import { T, toggleLanguage, onLanguageChange, getLanguage, applyLanguage } from '../i18n';
import { Store } from '../storage/store';
import { Auth } from '../auth/authManager';
import { CONFIG } from '../config/constants';
import { HeaderComponent } from './components/Header';
import { MetricsBarComponent } from './components/MetricsBar';
import { ChartsViewComponent } from './components/ChartsView';
import { FilterBarComponent } from './components/FilterBar';
import { ToolGridComponent } from './components/ToolGrid';
import { DetailModal } from './components/Modals/DetailModal';
import { ToolModal } from './components/Modals/ToolModal';
import { CheckoutModal } from './components/Modals/CheckoutModal';
import { ReturnModal } from './components/Modals/ReturnModal';
import { TransferModal } from './components/Modals/TransferModal';
import { ServiceModal } from './components/Modals/ServiceModal';
import { RetireModal } from './components/Modals/RetireModal';
import { OrderModal } from './components/Modals/OrderModal';
import { AuditModal } from './components/Modals/AuditModal';
import { ScannerModal } from './components/Modals/ScannerModal';
import { LabelModal } from './components/Modals/LabelModal';
import { RegistryModal } from './components/Modals/RegistryModal';
import { AuditLogModal } from './components/Modals/AuditLogModal';
import { GateModal } from './components/Modals/GateModal';
import { SopModal } from './components/Modals/SopModal';
import { SystemMenuModal } from './components/Modals/SystemMenuModal';
import { OpsMenuModal } from './components/Modals/OpsMenuModal';
import { EmployeeProfileModal } from './components/Modals/EmployeeProfileModal';
import { RiskModal } from './components/Modals/RiskModal';
import { CalibrationModal } from './components/Modals/CalibrationModal';
import { isPermanentTool, isConsumableTool, workstationAndPostOf, statusBucket, toolMatchesQuery } from '../operations/toolOps';
import { receiveFullOrder, cancelOrder } from '../operations/orderOps';
import { daysUntil } from '../utils/formatters';
import { parseScanPayload } from '../utils/scanPayload';
import { toast } from '../utils/dom';
import { windowConfirm } from '../utils/dialogCompat';
import { hardReloadPwa } from '../utils/pwa';

export class AppUI {
    private header: HeaderComponent | null = null;
    private metrics: MetricsBarComponent | null = null;
    private charts: ChartsViewComponent | null = null;
    private filterBar: FilterBarComponent | null = null;
    private toolGrid: ToolGridComponent | null = null;

    private isWorkMode = false;
    private isLightMode = false;
    private scanBuffer = '';
    private lastScanKeyTime = 0;

    public init(): void {
        this.setupThemeAndMode();
        // Apply the persisted language to any static DOM before first paint.
        applyLanguage();
        this.mountComponents();
        this.bindGlobalKeyboard();
        this.bindBackdropAndEscape();
        this.bindGlobalActionDelegation();
        this.attachGlobalWindowApi();

        // Subscribe to Store state changes
        Store.subscribe(() => {
            this.refreshAll();
        });

        // Subscribe to Language toggle
        onLanguageChange(() => {
            this.refreshAll();
        });

        // Initialize Gate
        GateModal.initGate();

        // Open a tool / location from a QR deep link (?tool= / ?loc=).
        this.handleDeepLink();
    }

    /**
     * QR deep-link router. Labels encode `…/?tool=ID` or `…/?loc=LOC:…`; opening
     * that URL (phone camera, shared link, installed PWA) must land on the tool
     * card or the storage view. The monolith had this in `init()`; the modular
     * entry point dropped it, so external scans did nothing.
     */
    private handleDeepLink(): void {
        const params = new URLSearchParams(location.search);
        const toolId = params.get('tool') || params.get('id');
        const locId = params.get('loc') || params.get('name');
        if (!toolId && !locId) return;

        const cleanUrl = () => {
            try { window.history.replaceState({}, document.title, window.location.pathname); } catch { /* ignore */ }
        };

        if (toolId) {
            const tool = Store.getTool(toolId);
            if (tool) {
                DetailModal.open(tool.id);
            } else {
                toast(`${T('Tool not found:')} ${toolId}`, 'warning');
            }
            cleanUrl();
        } else if (locId) {
            this.setFilter('location_qr', locId);
            cleanUrl();
        }
    }

    private setupThemeAndMode(): void {
        try {
            this.isLightMode = localStorage.getItem('inv_theme') === 'light';
            if (this.isLightMode) {
                document.documentElement.setAttribute('data-theme', 'light');
            }

            // URL ?mode=work / ?mode=full wins over the saved preference
            // (shop-floor tablet shortcut), then gets persisted.
            const urlMode = new URLSearchParams(location.search).get('mode');
            let work: boolean;
            if (urlMode === 'work' || urlMode === 'full') {
                work = urlMode === 'work';
                try { localStorage.setItem('inv_mode', work ? 'work' : 'full'); } catch { /* ignore */ }
            } else {
                work = localStorage.getItem('inv_mode') === 'work';
            }
            this.isWorkMode = work;
            document.body.classList.toggle('work-mode', work);
        } catch (e) {
            // Fall back to defaults if preferences are unreadable
            console.error('[app:setupThemeAndMode] Failed to read theme/mode preferences:', e);
        }
    }

    private mountComponents(): void {
        const headerContainer = document.querySelector('header');
        const tooltipEl = document.getElementById('svgTooltip') || this.createTooltipDOM();
        const mainContainer = document.querySelector('main');

        if (!mainContainer) return;

        // 1. Mount Header
        if (headerContainer) {
            this.header = new HeaderComponent(headerContainer, {
                onToggleMode: () => this.toggleWorkMode(),
                onToggleTheme: () => this.toggleTheme(),
                onToggleLanguage: () => toggleLanguage(),
                onOpenFaq: () => SopModal.openFaq(),
                onLock: () => Auth.lockSystem(),
                onLoginClick: () => {
                    if (Auth.current.username !== 'operator') {
                        Auth.lockSystem();
                    } else {
                        GateModal.openLoginPrompt();
                    }
                },
                onOpenSystemMenu: () => Auth.doAction('Administrator', () => SystemMenuModal.open()),
                onOpenOpsMenu: () => OpsMenuModal.open()
            });
            this.header.render();
        }

        // 2. Mount Metrics Bar
        let kpiDiv = headerContainer?.querySelector<HTMLElement>('.kpi-container');
        if (!kpiDiv && headerContainer) {
            kpiDiv = document.createElement('div');
            kpiDiv.className = 'kpi-container';
            headerContainer.appendChild(kpiDiv);
        }
        if (kpiDiv) {
            this.metrics = new MetricsBarComponent(
                kpiDiv,
                tooltipEl,
                (type, val) => this.setFilter(type, val),
                () => this.clearFilter()
            );
            this.metrics.render();
        }

        // 3. Mount Charts
        let chartsDiv = mainContainer.querySelector<HTMLElement>('.dashboard-charts');
        if (!chartsDiv) {
            chartsDiv = document.createElement('div');
            chartsDiv.className = 'dashboard-charts';
            mainContainer.appendChild(chartsDiv);
        }
        this.charts = new ChartsViewComponent(chartsDiv, {
            onFilterSelect: (type, val) => this.setFilter(type, val),
            onOpenAuditHistory: (pillarIdx) => AuditModal.openHistory(pillarIdx),
            onCompleteMaint: (toolId) => {
                Auth.doAction('Tool Crib Manager', () => ServiceModal.open(toolId));
            },
            onOpenRiskDetail: (ws, post) => RiskModal.open(ws, post)
        });
        this.charts.render();

        // 4. Mount Filter Bar
        let filterBarDiv = mainContainer.querySelector<HTMLElement>('#filterBarRoot');
        if (!filterBarDiv) {
            filterBarDiv = document.createElement('div');
            filterBarDiv.id = 'filterBarRoot';
            mainContainer.appendChild(filterBarDiv);
        }
        this.filterBar = new FilterBarComponent(filterBarDiv, {
            onSearch: () => {
                // Like the monolith: a non-empty search jumps to the detailed
                // grid, otherwise the results would render into the hidden grid.
                const q = (document.querySelector<HTMLInputElement>('#globalSearch')?.value || '').trim();
                if (q && this.filterBar && this.filterBar.getViewMode() !== 'grid') {
                    this.filterBar.setViewMode('grid');
                } else {
                    this.filterAndRenderGrid();
                }
            },
            onStatusFilterChange: (status) => status ? this.setFilter('status', status) : this.clearFilter(),
            onResetFilter: () => this.clearFilter(),
            onScanClick: () => ScannerModal.open((code) => this.handleScanResult(code)),
            onViewModeChange: (mode) => {
                if (this.toolGrid) {
                    this.toolGrid.showView(mode);
                    if (mode === 'grid') this.filterAndRenderGrid();
                }
            }
        });
        this.filterBar.render();

        // 5. Mount Tool Grid & Category Hub
        let gridRoot = mainContainer.querySelector<HTMLElement>('#toolGridRoot');
        if (!gridRoot) {
            gridRoot = document.createElement('div');
            gridRoot.id = 'toolGridRoot';
            mainContainer.appendChild(gridRoot);
        }
        this.toolGrid = new ToolGridComponent(gridRoot, {
            onAction: (action, id, extra) => this.handleAction(action, id, extra),
            onSetFilter: (type, val) => this.setFilter(type, val),
            onResetFilter: () => this.clearFilter(),
            onOpenSop: (code) => SopModal.openSop(code),
            onOpenOrders: () => OrderModal.openList(),
            onOpenRegistries: () => Auth.doAction('Administrator', () => RegistryModal.open()),
            onOpenArchive: () => Auth.doAction('Administrator', () => AuditLogModal.openArchive()),
            onOpenCalibrationSession: () => Auth.doAction('Tool Crib Manager', () => CalibrationModal.openSession())
        });
        this.toolGrid.render();
    }

    private createTooltipDOM(): HTMLElement {
        let el = document.getElementById('svgTooltip');
        if (!el) {
            el = document.createElement('div');
            el.id = 'svgTooltip';
            el.style.display = 'none';
            document.body.appendChild(el);
        }
        return el;
    }

    public setFilter(type: string, value: string): void {
        if (this.filterBar) {
            this.filterBar.setFilter(type, value);
            this.filterBar.setViewMode('grid');
        }
        this.filterAndRenderGrid();
    }

    public clearFilter(): void {
        if (this.filterBar) {
            this.filterBar.clearFilter();
        }
        this.filterAndRenderGrid();
    }

    private filterAndRenderGrid(): void {
        if (!this.toolGrid || !this.filterBar) return;

        const currentFilter = this.filterBar.getFilter();
        const searchInput = document.querySelector<HTMLInputElement>('#globalSearch');
        const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

        let tools = Store.activeTools();

        // Filter predicate
        if (currentFilter.type === 'status' && currentFilter.value) {
            tools = tools.filter(t => statusBucket(t.status) === currentFilter.value);
        } else if (currentFilter.type === 'workstation' && currentFilter.value) {
            tools = tools.filter(t => workstationAndPostOf(t).ws === currentFilter.value);
        } else if (currentFilter.type === 'location' && currentFilter.value) {
            tools = tools.filter(t => {
                const loc = workstationAndPostOf(t);
                const hasPost = loc.post && loc.post !== 'Unknown' && loc.post !== loc.ws;
                const label = hasPost ? `${loc.ws} | ${loc.post}` : loc.ws;
                return label === currentFilter.value || loc.ws === currentFilter.value;
            });
        } else if (currentFilter.type === 'permanent') {
            tools = tools.filter(isPermanentTool);
        } else if (currentFilter.type === 'consumable') {
            tools = tools.filter(isConsumableTool);
        } else if (currentFilter.type === 'maintq') {
            tools = tools.filter(t =>
                t.status === 'Maintenance' ||
                t.status === 'Overdue' ||
                (daysUntil(t.calDue) !== null && daysUntil(t.calDue)! <= CONFIG.CAL_WARNING_DAYS)
            );
        } else if (currentFilter.type === 'location_qr' && currentFilter.value) {
            const parts = currentFilter.value.split(':');
            const qZ = parts[2] ? parts[2].toLowerCase() : null;
            const qR = parts[3] ? parts[3].toLowerCase() : null;
            const qS = parts[4] ? parts[4].toLowerCase() : null;
            const qB = parts[5] ? parts[5].toLowerCase() : null;

            tools = tools.filter(t => {
                if (!t.address) return false;
                if (qZ && (t.address.zone || '').toLowerCase() !== qZ) return false;
                if (qR && (t.address.rack || '').toLowerCase() !== qR) return false;
                if (qS && (t.address.shelf || '').toLowerCase() !== qS) return false;
                if (qB && (t.address.bin || '').toLowerCase() !== qB) return false;
                return true;
            });
        }

        // Search query — shared haystack (class label EN/RU, category, spec, program,
        // SN, article, station/post, holder), multi-token, case-insensitive.
        if (query) {
            tools = tools.filter(t => toolMatchesQuery(t, query));
        }

        this.toolGrid.renderTools(tools, currentFilter.type, currentFilter.value);
    }

    public handleScanResult(code: string): void {
        // Labels encode a full URL; wedge scanners / manual entry give a bare id.
        const payload = parseScanPayload(code);

        if (payload.kind === 'tool') {
            const tool = Store.getTool(payload.value);
            if (tool) {
                DetailModal.open(tool.id);
                return;
            }
        } else if (payload.kind === 'location') {
            this.setFilter('location_qr', payload.value);
            return;
        }

        const raw = payload.kind === 'raw' ? payload.value : code;

        if (raw.startsWith('LOC:')) {
            this.setFilter('location_qr', raw);
            return;
        }

        const tool = Store.getTool(raw);
        if (tool) {
            DetailModal.open(tool.id);
            return;
        }

        const emp = Store.getEmp(raw);
        if (emp) {
            EmployeeProfileModal.open(emp.id);
            return;
        }

        // Fallback: search query
        const searchInput = document.querySelector<HTMLInputElement>('#globalSearch');
        if (searchInput) {
            searchInput.value = raw;
            this.filterAndRenderGrid();
        }
    }

    public handleAction(action: string, id: string, extra?: HTMLElement): void {
        switch (action) {
            case 'tool-detail':
                DetailModal.open(id);
                break;
            case 'emp-profile':
                EmployeeProfileModal.open(id);
                break;
            case 'assign':
                CheckoutModal.open(id);
                break;
            case 'return':
                ReturnModal.open(id);
                break;
            case 'transfer':
                Auth.doAction('Administrator', () => TransferModal.open(id));
                break;
            case 'service':
            case 'complete-maint':
                Auth.doAction('Tool Crib Manager', () => ServiceModal.open(id));
                break;
            case 'calibrate':
                Auth.doAction('Tool Crib Manager', () => CalibrationModal.open(id));
                break;
            case 'calibration-session':
                Auth.doAction('Tool Crib Manager', () => CalibrationModal.openSession());
                break;
            case 'retire':
                Auth.doAction('Administrator', () => RetireModal.open(id));
                break;
            case 'print-label':
                Auth.doAction('Tool Crib Manager', () => LabelModal.openToolLabel(id));
                break;
            case 'procure':
                OrderModal.openProcure(id);
                break;
            case 'order-detail':
                OrderModal.openDetail(id);
                break;
            case 'edit-tool':
                Auth.doAction('Administrator', () => ToolModal.openEdit(id));
                break;
            case 'audit-post':
                Auth.doAction('Tool Crib Manager', () => {
                    const ws = extra?.dataset.ws;
                    AuditModal.openPostAudit(ws, id);
                });
                break;
            case 'receive-order':
                Auth.doAction('Tool Crib Manager', async () => {
                    await receiveFullOrder(id);
                    toast(T('ORDER_RECEIVED'), 'success');
                    this.refreshAll();
                });
                break;
            case 'cancel-order':
                Auth.doAction('Tool Crib Manager', async () => {
                    if (windowConfirm(T('ORDER_CANCEL') + '?')) {
                        await cancelOrder(id);
                        toast(T('ORDER_CANCELLED'), 'danger');
                        this.refreshAll();
                    }
                });
                break;
            case 'recv-item':
            case 'reject-item':
                // Emitted by OrderModal and handled by its own local listeners;
                // the global delegation must stay inert for these.
                break;
            default:
                console.warn('[app:handleAction] Unhandled action:', action, id);
        }
    }

    private toggleWorkMode(): void {
        this.isWorkMode = !this.isWorkMode;
        document.body.classList.toggle('work-mode', this.isWorkMode);
        try {
            localStorage.setItem('inv_mode', this.isWorkMode ? 'work' : 'full');
        } catch (e) {
            console.error('[app:toggleWorkMode] Failed to persist work mode:', e);
            toast(T('PREF_SAVE_FAILED'), 'warning');
        }
        this.paintModeBtn();
        // Returning to the dashboard: redraw charts with fresh data
        if (!this.isWorkMode && this.charts) this.charts.update();
    }

    /** Button shows the TARGET mode (like the monolith): Dashboard when in work mode. */
    private paintModeBtn(): void {
        const btnText = document.getElementById('modeBtnText');
        if (btnText) btnText.textContent = this.isWorkMode ? T('Dashboard') : T('Work Mode');
    }

    private toggleTheme(): void {
        this.isLightMode = !this.isLightMode;
        if (this.isLightMode) {
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        try {
            localStorage.setItem('inv_theme', this.isLightMode ? 'light' : 'dark');
        } catch (e) {
            console.error('[app:toggleTheme] Failed to persist theme:', e);
            toast(T('PREF_SAVE_FAILED'), 'warning');
        }
        const btn = document.getElementById('themeToggleBtn');
        if (btn) btn.textContent = this.isLightMode ? '🌙 Dark' : '☀️ Light';
    }

    private bindGlobalKeyboard(): void {
        // Barcode wedge keyboard scanner listener (<30ms keystrokes)
        document.addEventListener('keydown', (e) => {
            const inInput = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement?.tagName || ''));
            if (inInput) {
                this.scanBuffer = '';
                return;
            }

            const now = Date.now();
            if (now - this.lastScanKeyTime > CONFIG.SCAN_KEY_TIMEOUT_MS) {
                this.scanBuffer = '';
            }
            this.lastScanKeyTime = now;

            if (e.key === 'Enter' && this.scanBuffer.length >= 3) {
                this.handleScanResult(this.scanBuffer);
                this.scanBuffer = '';
            } else if (e.key.length === 1) {
                this.scanBuffer += e.key;
            }
        });
    }

    private bindBackdropAndEscape(): void {
        document.addEventListener('mousedown', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList && target.classList.contains('modal-overlay')) {
                if (target.id === 'loginModal') {
                    Auth.clearPendingAction();
                }
                target.classList.remove('active');
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const openModals = document.querySelectorAll('.modal-overlay.active');
                if (openModals.length > 0) {
                    const topModal = openModals[openModals.length - 1];
                    if (topModal.id === 'loginModal') {
                        Auth.clearPendingAction();
                    }
                    topModal.classList.remove('active');
                }
            }
        });
    }

    private bindGlobalActionDelegation(): void {
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const actionEl = target.closest<HTMLElement>('[data-action]');
            if (!actionEl) return;
            const action = actionEl.dataset.action;
            const id = actionEl.dataset.id || '';
            if (action) {
                this.handleAction(action, id, actionEl);
            }
        });
    }

    public refreshAll(): void {
        if (this.header) this.header.render();
        if (this.filterBar) this.filterBar.render();
        if (this.metrics) this.metrics.update();
        if (this.charts) this.charts.update();
        if (this.toolGrid) {
            this.toolGrid.updateCategoryHub();
            this.filterAndRenderGrid();
        }
    }

    private attachGlobalWindowApi(): void {
        (window as any).openModal = (id: string) => {
            const el = document.getElementById(id);
            if (el) el.classList.add('active');
        };
        (window as any).closeModal = (id: string | HTMLElement) => {
            const el = typeof id === 'string' ? document.getElementById(id) : id;
            if (el) el.classList.remove('active');
        };
        (window as any).doAction = (role: any, cb: any) => Auth.doAction(role, cb);
        (window as any).handleScanResult = (code: string) => this.handleScanResult(code);
        (window as any).toggleLanguage = () => toggleLanguage();
        (window as any).forceUpdatePWA = () => hardReloadPwa();
        (window as any).T = T;
        (window as any).getLanguage = getLanguage;
        (window as any).CONFIG = CONFIG;
        (window as any).Store = Store;
        (window as any).Auth = Auth;
    }
}

export const App = new AppUI();
