// ============================================================================
// 5S Tool Command Center — ToolGrid Component
// ============================================================================

import { T } from '../../i18n';
import { Store } from '../../storage/store';
import { CONFIG } from '../../config/constants';
import { esc, daysUntil } from '../../utils/formatters';
import { Tool } from '../../types/inventory';

export interface ToolGridCallbacks {
    onAction: (action: string, id: string, extra?: any) => void;
    onSetFilter: (type: string, value: string) => void;
    onResetFilter: () => void;
    onOpenSop: (code: string) => void;
    onOpenOrders: () => void;
    onOpenRegistries: () => void;
    onOpenArchive: () => void;
}

export class ToolGridComponent {
    private container: HTMLElement;
    private callbacks: ToolGridCallbacks;
    private hubContainer: HTMLElement | null = null;
    private gridContainer: HTMLElement | null = null;
    private cardState: Record<string, number>;

    constructor(container: HTMLElement, callbacks: ToolGridCallbacks) {
        this.container = container;
        this.callbacks = callbacks;
        try {
            this.cardState = JSON.parse(localStorage.getItem('inv_cards') || '{}');
        } catch {
            this.cardState = {};
        }
    }

    private isCardCollapsed(key: string): boolean {
        const saved = this.cardState[key];
        if (saved !== undefined) return !!saved;
        if (window.innerWidth > 640) return false;
        const openByDefault = ['hub_tools'];
        return !openByDefault.includes(key);
    }

    public toggleCard(el: HTMLElement): void {
        const card = el.closest<HTMLElement>('[data-card-key]');
        if (!card) return;
        const collapsed = !card.classList.contains('collapsed');
        card.classList.toggle('collapsed', collapsed);
        const key = card.dataset.cardKey;
        if (key) {
            this.cardState[key] = collapsed ? 1 : 0;
            try {
                localStorage.setItem('inv_cards', JSON.stringify(this.cardState));
            } catch {
                // Ignore
            }
        }
    }

    public render(): void {
        this.container.innerHTML = `
            <div class="grid" id="categoryHubGrid"></div>
            <div class="grid" id="toolGrid" style="display:none;"></div>
        `;

        this.hubContainer = this.container.querySelector('#categoryHubGrid');
        this.gridContainer = this.container.querySelector('#toolGrid');

        this.bindDelegation();
        this.updateCategoryHub();
    }

    private bindDelegation(): void {
        this.container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            // Handle collapse toggle
            const collapseHeader = target.closest<HTMLElement>('.collapse-toggle');
            if (collapseHeader) {
                this.toggleCard(collapseHeader);
                return;
            }

            // Handle data-action
            const actionEl = target.closest<HTMLElement>('[data-action]');
            if (actionEl) {
                const action = actionEl.dataset.action;
                const id = actionEl.dataset.id || '';
                if (action) {
                    this.callbacks.onAction(action, id, actionEl);
                }
            }
        });
    }

    public showView(mode: 'category' | 'grid'): void {
        if (this.hubContainer) this.hubContainer.style.display = mode === 'category' ? 'grid' : 'none';
        if (this.gridContainer) this.gridContainer.style.display = mode === 'grid' ? 'grid' : 'none';
    }

    public updateCategoryHub(): void {
        if (!this.hubContainer) return;
        const active = Store.activeTools();

        const isPerm = (t: Tool) => CONFIG.PERMANENT_PREFIXES.some(p => t.id.startsWith(p));
        const isCons = (t: Tool) => CONFIG.CONSUMABLE_PREFIXES.some(p => t.id.startsWith(p)) || t.type === 'Consumable';
        const calSoon = (t: Tool) => { const d = daysUntil(t.calDue); return d !== null && d <= CONFIG.CAL_WARNING_DAYS; };

        const perm = active.filter(isPerm);
        const permCal = perm.filter(calSoon).length;
        const issuedCount = active.filter(t => t.assigneeId).length;
        const maintQueue = active.filter(t => t.status === 'Maintenance' || t.status === 'Overdue' || calSoon(t));

        // Low stock consumables
        const lowStock: Record<string, string> = {};
        active.filter(isCons).forEach(t => {
            if (!t.minQty) return;
            const inStock = active.filter(x => x.category === t.category && x.status === 'Active')
                                  .reduce((sum, x) => sum + (x.qty || 1), 0);
            if (inStock < t.minQty) lowStock[t.category] = `${inStock}/${t.minQty}`;
        });
        const lowStockHtml = Object.keys(lowStock).length
            ? `<p style="margin:10px 0 0; color:var(--danger); background:rgba(255,0,60,0.1); padding:7px; border-radius:4px; font-size:0.9rem;">
                ${T('LOW STOCK')}: ${esc(Object.entries(lowStock).map(([c, v]) => `${c} (${v})`).join(', '))}
               </p>`
            : '';

        const card = (title: string, body: string, actions: string, warn: boolean, key: string) => `
            <div class="tool-card ${this.isCardCollapsed(key) ? 'collapsed' : ''}" data-card-key="${key}">
                <div class="tool-header collapse-toggle">
                    <div class="tool-title" style="font-size:1.05rem; color:${warn ? 'var(--warning)' : 'var(--primary-hover)'};">${title}</div>
                    <span class="collapse-chevron">▾</span>
                </div>
                <div class="collapsible"><div class="collapsible-inner">
                    <div class="tool-body" style="text-align:left; cursor:default; padding-top:10px;">${body}</div>
                    ${actions ? `<div class="tool-actions">${actions}</div>` : ''}
                </div></div>
            </div>`;

        const row = (left: string, right: any, rColor?: string) => `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:5px 4px; border-bottom:1px dashed var(--border); font-size:0.88rem;">
                <span style="color:var(--text-main); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${left}</span>
                <span style="flex-shrink:0; color:${rColor || 'var(--text-main)'}; font-weight:bold;">${right}</span>
            </div>`;

        // 1. Tools Hub
        const toolsBody = `
            <div style="text-align:center; margin-bottom:8px;">
                <div style="font-size:2rem; font-weight:bold; color:var(--text-main); line-height:1.1;">${perm.length}</div>
                <div style="color:var(--text-muted); font-size:0.85rem; text-transform:uppercase;">${T('Total Permanent Tools:')}</div>
            </div>
            ${row(`<span style="color:var(--success);">● ${esc(T('Active'))}</span>`, perm.filter(t => t.status === 'Active').length)}
            ${row(`<span style="color:var(--primary-hover);">● ${esc(T('Issued'))}</span>`, perm.filter(t => t.status === 'Issued').length)}
            ${row(`<span style="color:var(--warning);">● ${esc(T('Maintenance'))}</span>`, perm.filter(t => t.status === 'Maintenance').length)}
            ${row(`<span style="color:var(--danger);">● ${esc(T('Overdue'))}</span>`, perm.filter(t => t.status === 'Overdue').length)}
            ${row(`⚗ ${T('Calibration due ≤14d')}`, permCal, permCal ? 'var(--warning)' : 'var(--success)')}
            ${row(`<a href="#" class="archive-link" style="color:var(--text-main); text-decoration:underline;">🗑 ${T('Decommissioned Assets Archive')}</a>`, Store.retiredTools().length, 'var(--text-muted)')}
        `;

        // 2. Staff Hub
        const staffRows = Store.personnel.slice(0, 4).map(emp => {
            const mine = active.filter(t => t.assigneeId === emp.id);
            const myOverdue = mine.filter(t => t.status === 'Overdue').length;
            const myCal = mine.filter(calSoon).length;
            const careScore = emp.careScore ?? 100;
            const careColor = careScore >= 80 ? 'var(--success)' : careScore >= 60 ? 'var(--warning)' : 'var(--danger)';

            return `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:5px 4px; border-bottom:1px dashed var(--border); font-size:0.85rem;">
                <span class="person-badge" data-action="emp-profile" data-id="${esc(emp.id)}" style="overflow:hidden; cursor:pointer;">👤 ${esc(emp.name)}</span>
                <span style="flex-shrink:0; white-space:nowrap;">
                    <span title="${T('Tools held')}">🛠${mine.length}</span>
                    <span title="${T('Calibration due')}" style="color:${myCal ? 'var(--warning)' : 'var(--text-muted)'};"> ⚗${myCal}</span>
                    <span title="${T('Overdue')}" style="color:${myOverdue ? 'var(--danger)' : 'var(--text-muted)'};"> ⏰${myOverdue}</span>
                    <span style="background:${careColor}; color:#000; font-size:0.75rem; padding:1px 5px; border-radius:3px; margin-left:4px;">${careScore}%</span>
                </span>
            </div>`;
        }).join('');

        const staffBody = `
            ${row(T('Assigned Personnel:'), Store.personnel.length, 'var(--primary-hover)')}
            ${row(T('Total Tools Issued:'), issuedCount, issuedCount ? 'var(--warning)' : 'var(--success)')}
            <div style="margin-top:8px;">${staffRows || `<div style="color:var(--text-muted); text-align:center; padding:8px;">${T('No personnel records.')}</div>`}</div>
            ${Store.personnel.length > 4 ? `<div style="text-align:center; color:var(--text-muted); font-size:0.8rem; margin-top:5px;">+${Store.personnel.length - 4} ${T('more…')}</div>` : ''}
        `;

        // 3. WS Hub
        const wsRows = Store.workstations.slice(0, 5).map(ws => {
            const count = active.filter(t => Store.workstationOf(t) === ws).length;
            return row(`📍 ${esc(ws)}`, `${count} ${T('tools')}`, count > 0 ? 'var(--text-main)' : 'var(--text-muted)');
        }).join('');

        const wsBody = `
            ${row(T('Active Workstations:'), Store.workstations.length, 'var(--primary-hover)')}
            ${row(T('Workposts:'), Store.workposts.length, 'var(--primary-hover)')}
            <div style="margin-top:8px;">${wsRows}</div>
        `;

        // 4. Consumables Hub
        const consCats: Record<string, number[]> = {};
        active.filter(isCons).forEach(t => {
            const c = t.category || 'Misc';
            (consCats[c] = consCats[c] || []).push(Store.wearOf(t));
        });
        const consRows = Object.entries(consCats).slice(0, 5).map(([cat, wears]) => {
            const avg = Math.round(wears.reduce((a, b) => a + b, 0) / wears.length);
            return row(esc(cat), `${wears.length} ${T('items')} · ${avg}% ${T('wear')}`,
                avg > CONFIG.WEAR_RETIRE_PCT ? 'var(--danger)' : avg > CONFIG.WEAR_WARN_PCT ? 'var(--warning)' : 'var(--success)');
        }).join('');

        const consBody = `
            ${row(T('Tracked Consumables:'), active.filter(isCons).length, 'var(--primary-hover)')}
            <div style="margin-top:8px;">${consRows || `<div style="color:var(--text-muted); text-align:center; padding:8px;">${T('No consumables found.')}</div>`}</div>
            ${lowStockHtml}
        `;

        // 5. Procurement Hub
        const plog = Store.procurementLog;
        const poOpen = plog.filter(l => (l.status || 'open') === 'open');
        const poRecv = plog.filter(l => l.status === 'received');
        const poCncl = plog.filter(l => l.status === 'cancelled');
        const poSum = (arr: any[]) => arr.reduce((s, r) => s + (+r.total || ((+r.qty || 0) * (+r.cost || 0)) || 0), 0);

        const poLatest = [...plog].reverse().slice(0, 3).map(l => {
            const stColor = l.status === 'received' ? 'var(--success)' : l.status === 'cancelled' ? 'var(--danger)' : 'var(--warning)';
            const stLabel = l.status === 'received' ? T('ORDER_RECEIVED') : l.status === 'cancelled' ? T('ORDER_CANCELLED') : (l.status || 'open');
            return row(`🛒 ${esc(l.name)}`, `<span style="color:${stColor};">${stLabel}</span> · $${(+l.total || 0).toFixed(0)}`);
        }).join('');

        const procBody = `
            <div style="text-align:center; margin-bottom:8px;">
                <div style="font-size:2rem; font-weight:bold; line-height:1.1; color:${poOpen.length ? 'var(--warning)' : 'var(--success)'};">${poOpen.length}</div>
                <div style="color:var(--text-muted); font-size:0.85rem; text-transform:uppercase;">${T('ORDERS_IN_WORK')} · $${poSum(poOpen).toFixed(2)}</div>
            </div>
            ${row(`<span style="color:var(--success);">● ${T('ORDER_RECEIVED')}</span>`, poRecv.length)}
            ${row(`<span style="color:var(--danger);">● ${T('ORDER_CANCELLED')}</span>`, poCncl.length)}
            ${poLatest ? `<div style="margin-top:6px;">${poLatest}</div>` : `<div style="color:var(--text-muted); text-align:center; padding:8px;">${T('No order history yet.')}</div>`}
        `;

        // 6. Maintenance Queue Hub
        const mMaint = maintQueue.filter(t => t.status === 'Maintenance').length;
        const mOver = maintQueue.filter(t => t.status === 'Overdue').length;
        const mCal = maintQueue.filter(t => t.status !== 'Maintenance' && t.status !== 'Overdue').length;
        const urgent = maintQueue.slice(0, 3).map(t => row(
            `${esc(t.id)} — ${esc(t.name.split(' ').slice(0, 3).join(' '))}…`,
            t.status === 'Overdue' ? T('OVERDUE') : t.status === 'Maintenance' ? T('SERVICE') : `⚗ ${T('Calibration due')} ${daysUntil(t.calDue)}d`,
            t.status === 'Overdue' ? 'var(--danger)' : 'var(--warning)'
        )).join('');

        const maintBody = `
            <div style="text-align:center; margin-bottom:8px;">
                <div style="font-size:2rem; font-weight:bold; line-height:1.1; color:${maintQueue.length ? 'var(--danger)' : 'var(--success)'};">${maintQueue.length}</div>
                <div style="color:var(--text-muted); font-size:0.85rem; text-transform:uppercase;">${T('Items Due (≤14 days) or Overdue:')}</div>
            </div>
            ${row(`🔧 ${T('In service')}`, mMaint, mMaint ? 'var(--warning)' : undefined)}
            ${row(`⏰ ${T('Overdue')}`, mOver, mOver ? 'var(--danger)' : undefined)}
            ${row(`⚗ ${T('Calibration due')}`, mCal, mCal ? 'var(--warning)' : undefined)}
            ${urgent ? `<div style="margin-top:6px;">${urgent}</div>` : ''}
        `;

        // 7. SOP Hub
        const sopBody = `
            <div style="display:flex; flex-direction:column; gap:8px; justify-content:center; height:100%;">
                <button class="btn btn-muted" style="font-size:0.9rem;" data-sop="GEN">📖 SOP-GEN-00 (5S Handling)</button>
                <button class="btn btn-muted" style="font-size:0.9rem;" data-sop="TW">📖 SOP-TW-01 (Torque)</button>
                <button class="btn btn-muted" style="font-size:0.9rem;" data-sop="BT">📖 SOP-BT-02 (Battery)</button>
                <button class="btn btn-muted" style="font-size:0.9rem;" data-sop="PB">📖 SOP-PB-03 (Bits/Wear)</button>
            </div>
        `;

        this.hubContainer.innerHTML =
            card(T('HUB_TOOLS'), toolsBody, `<button class="btn wide" id="hubExploreToolsBtn">${T('[Explore Tools]')}</button>`, false, 'hub_tools') +
            card(T('HUB_STAFF'), staffBody, `<button class="btn wide" id="hubViewStaffBtn">${T('[View Personnel Assets]')}</button>`, false, 'hub_staff') +
            card(T('HUB_WS'), wsBody, `<button class="btn wide" id="hubViewWsBtn">${T('[View Workstations]')}</button>`, false, 'hub_ws') +
            card(T('HUB_CONS'), consBody, `<button class="btn wide" id="hubViewConsBtn">${T('[View Consumables]')}</button>`, false, 'hub_cons') +
            card(T('HUB_PROC'), procBody, `<button class="btn wide" id="hubViewProcBtn">${T('[Open Orders Registry]')}</button>`, poOpen.length > 0, 'hub_proc') +
            card(T('HUB_MAINT'), maintBody, `<button class="btn btn-warning wide" id="hubViewMaintBtn">${T('[Open Service Queue]')}</button>`, true, 'hub_maint') +
            card(T('HUB_SOP'), sopBody, '', false, 'hub_sop');

        // Bind Hub card buttons
        this.hubContainer.querySelector('#hubExploreToolsBtn')?.addEventListener('click', () => this.callbacks.onSetFilter('permanent', 'Permanent'));
        this.hubContainer.querySelector('#hubViewStaffBtn')?.addEventListener('click', () => this.callbacks.onSetFilter('status', 'Issued'));
        this.hubContainer.querySelector('#hubViewWsBtn')?.addEventListener('click', () => this.callbacks.onOpenRegistries());
        this.hubContainer.querySelector('#hubViewConsBtn')?.addEventListener('click', () => this.callbacks.onSetFilter('consumable', 'Consumables'));
        this.hubContainer.querySelector('#hubViewProcBtn')?.addEventListener('click', () => this.callbacks.onOpenOrders());
        this.hubContainer.querySelector('#hubViewMaintBtn')?.addEventListener('click', () => this.callbacks.onSetFilter('maintq', 'Maintenance Queue'));

        this.hubContainer.querySelector('.archive-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.callbacks.onOpenArchive();
        });

        this.hubContainer.querySelectorAll('[data-sop]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const code = (e.currentTarget as HTMLElement).dataset.sop;
                if (code) this.callbacks.onOpenSop(code);
            });
        });
    }

    public renderTools(tools: Tool[], filterType?: string | null, filterValue?: string | null): void {
        if (!this.gridContainer) return;

        if (!tools.length) {
            this.gridContainer.innerHTML = `
                <div class="empty-state" style="grid-column:1/-1; text-align:center; padding:40px 20px;">
                    <p style="color:var(--text-muted); font-size:1.1rem;">${T('NO_TOOLS_MATCH')}</p>
                    <button class="btn" id="emptyResetFilterBtn" style="margin-top:15px;">${T('Reset Filter')}</button>
                </div>
            `;
            this.gridContainer.querySelector('#emptyResetFilterBtn')?.addEventListener('click', () => {
                this.callbacks.onResetFilter();
            });
            return;
        }

        const renderToolCard = (tool: Tool) => {
            const emp = tool.assigneeId ? Store.getEmp(tool.assigneeId) : null;
            const holder = emp
                ? `<span class="person-badge" data-action="emp-profile" data-id="${esc(emp.id)}" style="cursor:pointer;">👤 ${esc(emp.name)}</span>`
                : 'N/A';

            const maintBtn = tool.status === 'Maintenance'
                ? `<button class="btn btn-success wide" data-action="complete-maint" data-id="${esc(tool.id)}">${T('[Complete Maintenance]')}</button>`
                : `<button class="btn btn-warning wide" data-action="service" data-id="${esc(tool.id)}">${T('[Service / Calibrate]')}</button>`;

            const addrStr = tool.address
                ? ` | ${esc(tool.address.zone || '')} | ${esc(tool.address.rack || '')} ${esc(tool.address.shelf || '')}-${esc(tool.address.bin || '')}`
                : '';

            return `
            <div class="tool-card ${tool.status === 'Overdue' ? 'overdue' : ''}">
                <div class="tool-header" data-action="tool-detail" data-id="${esc(tool.id)}" style="cursor:pointer;">
                    <div>
                        <div class="tool-title">${esc(tool.name)}</div>
                        <div class="tool-id">${esc(tool.id)} · ${T('Qty')}: ${tool.qty || 1}</div>
                    </div>
                    <div class="status-badge ${esc(tool.status)}">${esc(T(tool.status))}</div>
                </div>
                <div class="tool-body" data-action="tool-detail" data-id="${esc(tool.id)}" style="cursor:pointer;">
                    <div class="tool-row"><span class="tool-label">${T('Location:')}</span><span class="tool-val" style="font-family:monospace;">${esc(tool.location)}${addrStr}</span></div>
                    <div class="tool-row"><span class="tool-label">${T('Spec:')}</span><span class="tool-val">${esc(tool.spec || 'N/A')}</span></div>
                    <div class="tool-row"><span class="tool-label">${T('Assigned To:')}</span><span class="tool-val">${holder}</span></div>
                </div>
                <div class="tool-actions">
                    ${tool.status === 'Pending Delivery' ? `
                        <button class="btn btn-success wide" data-action="receive-order" data-id="${esc(tool.id)}">${T('Mark as Received')}</button>
                        <button class="btn btn-muted wide" data-action="cancel-order" data-id="${esc(tool.id)}">${T('Cancel Order')}</button>
                    ` : `
                        ${tool.status === 'Issued' || tool.assigneeId ? `
                            <button class="btn btn-warning" data-action="return" data-id="${esc(tool.id)}">↩ ${T('Return Tool')}</button>
                        ` : `
                            <button class="btn" data-action="assign" data-id="${esc(tool.id)}">${T('[Assign Person]')}</button>
                        `}
                        <button class="btn" data-action="transfer" data-id="${esc(tool.id)}">${T('[Transfer / Move]')}</button>
                        ${maintBtn}
                        <button class="btn btn-warning wide" data-action="procure" data-id="${esc(tool.id)}">${T('[Procure / Order]')}</button>
                        <button class="btn wide" data-action="print-label" data-id="${esc(tool.id)}">${T('Print Sticker / Label')}</button>
                        <button class="btn btn-danger wide" data-action="retire" data-id="${esc(tool.id)}">${T('[Decommission / Retire]')}</button>
                    `}
                </div>
            </div>`;
        };

        // Location QR Filter Accordion Mode
        if (filterType === 'location_qr' && filterValue) {
            const parts = filterValue.split(':');
            const fType = parts[1] || '';
            const fZ = parts[2] || '';
            const fR = parts[3] || '';
            const fS = parts[4] || '';
            const fB = parts[5] || '';
            const resp = parts[6] || '';

            const isPerm = (t: Tool) => CONFIG.PERMANENT_PREFIXES.some(p => t.id.startsWith(p));
            const isCons = (t: Tool) => CONFIG.CONSUMABLE_PREFIXES.some(p => t.id.startsWith(p)) || t.type === 'Consumable';

            const totalCount = tools.length;
            const permCount = tools.filter(isPerm).length;
            const consCount = tools.filter(isCons).length;
            const permPct = totalCount ? Math.round((permCount / totalCount) * 100) : 0;
            const consPct = totalCount ? Math.round((consCount / totalCount) * 100) : 0;
            const needsMaintCount = tools.filter(t => t.status === 'Maintenance' || t.status === 'Calibration').length;
            const lowStockCount = tools.filter(t => (parseInt(String(t.qty)) || 1) <= 2 || Store.wearOf(t) > 70).length;
            const overdueCount = tools.filter(t => t.status === 'Overdue').length;

            let html = `
            <div style="background: var(--surface); border: 1px solid var(--border); color: var(--text-main); box-shadow: 0 4px 20px rgba(0,0,0,0.4); border-radius: 10px; padding: 20px; margin-bottom: 20px; grid-column: 1 / -1;">
                <h2 style="margin:0 0 10px 0; color: var(--primary); font-size: 1.25rem;">
                    📍 ${esc(fType || 'Location')} — Zone: ${esc(fZ || 'N/A')}, Rack: ${esc(fR || 'N/A')}, Shelf: ${esc(fS || 'N/A')}, Bin: ${esc(fB || 'N/A')}
                </h2>
                ${resp ? `<div style="margin-bottom:12px; font-size: 0.95rem; color: var(--text-main);"><strong>Responsible Person:</strong> ${esc(resp)}</div>` : ''}
                <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:12px;">
                    <span style="background:var(--primary); color:#ffffff; font-weight:bold; padding:6px 12px; border-radius:6px; font-size:0.85rem;">${permPct}% Permanent Tooling / ${consPct}% Consumables</span>
                    ${needsMaintCount > 0 ? `<span style="background:var(--warning); color:#000000; font-weight:bold; padding:6px 12px; border-radius:6px; font-size:0.85rem;">⚠️ ${needsMaintCount} items require Maintenance</span>` : ''}
                    ${lowStockCount > 0 ? `<span style="background:var(--danger); color:#ffffff; font-weight:bold; padding:6px 12px; border-radius:6px; font-size:0.85rem;">🔴 ${lowStockCount} items Low Stock / High Wear</span>` : ''}
                    ${overdueCount > 0 ? `<span style="background:var(--danger); color:#ffffff; font-weight:bold; padding:6px 12px; border-radius:6px; font-size:0.85rem;">⏰ ${overdueCount} items Overdue</span>` : ''}
                </div>
            </div>

            <div style="grid-column: 1 / -1; display:flex; gap:10px; margin-bottom:15px;">
                <button class="btn btn-muted" id="expandAllShelvesBtn">📂 ${T('Expand All')}</button>
                <button class="btn btn-muted" id="collapseAllShelvesBtn">📁 ${T('Collapse All')}</button>
            </div>
            `;

            const shelfGroups: Record<string, Tool[]> = {};
            tools.forEach(t => {
                const sKey = (t.address && t.address.shelf) ? t.address.shelf : 'Main Store';
                if (!shelfGroups[sKey]) shelfGroups[sKey] = [];
                shelfGroups[sKey].push(t);
            });

            let idx = 0;
            for (const sKey in shelfGroups) {
                html += `
                <div class="shelf-accordion-card" style="grid-column: 1 / -1; margin-bottom:14px; border:1px solid var(--border); border-radius:8px; overflow:hidden; background:var(--surface);">
                    <div class="shelf-header" data-shelf="shelf_box_${idx}" style="display:flex; justify-content:space-between; align-items:center; padding:14px 18px; background:var(--chip); color:var(--text-main); cursor:pointer; font-weight:bold; font-size:1rem;">
                        <span style="display:flex; align-items:center; gap:8px;">📂 ${T('Shelf')} ${esc(sKey)} <span style="background:var(--primary); color:#ffffff; padding:2px 10px; border-radius:12px; font-size:0.8rem; font-weight:bold;">${shelfGroups[sKey].length} ${T('items')}</span></span>
                        <span id="shelf_icon_shelf_box_${idx}" style="color:var(--text-muted);">▼</span>
                    </div>
                    <div id="shelf_box_${idx}" class="shelf-body grid" style="display:none; padding:16px; gap:16px;">
                        ${shelfGroups[sKey].map(renderToolCard).join('')}
                    </div>
                </div>`;
                idx++;
            }

            this.gridContainer.innerHTML = html;

            this.gridContainer.querySelectorAll('.shelf-header').forEach(header => {
                header.addEventListener('click', (e) => {
                    const shelfId = (e.currentTarget as HTMLElement).dataset.shelf;
                    if (!shelfId) return;
                    const body = this.gridContainer?.querySelector<HTMLElement>(`#${shelfId}`);
                    const icon = this.gridContainer?.querySelector<HTMLElement>(`#shelf_icon_${shelfId}`);
                    if (body) {
                        const isHidden = body.style.display === 'none';
                        body.style.display = isHidden ? 'grid' : 'none';
                        if (icon) icon.textContent = isHidden ? '▲' : '▼';
                    }
                });
            });

            this.gridContainer.querySelector('#expandAllShelvesBtn')?.addEventListener('click', () => {
                this.gridContainer?.querySelectorAll<HTMLElement>('.shelf-body').forEach(el => el.style.display = 'grid');
            });
            this.gridContainer?.querySelector('#collapseAllShelvesBtn')?.addEventListener('click', () => {
                this.gridContainer?.querySelectorAll<HTMLElement>('.shelf-body').forEach(el => el.style.display = 'none');
            });

            return;
        }

        // Standard Grid View
        this.gridContainer.innerHTML = tools.map(renderToolCard).join('');
    }
}
