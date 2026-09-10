// ============================================================================
// 5S Tool Command Center — Metrics Bar Component (KPIs)
// ============================================================================

import { T } from '../../i18n';
import { Store } from '../../storage/store';
import { esc } from '../../utils/formatters';
import { Tool } from '../../types/inventory';

export class MetricsBarComponent {
    private container: HTMLElement;
    private tooltipEl: HTMLElement;
    private onFilterSelect: (type: string, value: string) => void;
    private onFilterClear: () => void;

    constructor(
        container: HTMLElement,
        tooltipEl: HTMLElement,
        onFilterSelect: (type: string, value: string) => void,
        onFilterClear: () => void
    ) {
        this.container = container;
        this.tooltipEl = tooltipEl;
        this.onFilterSelect = onFilterSelect;
        this.onFilterClear = onFilterClear;
    }

    public render(): void {
        this.container.className = 'kpi-container';
        this.container.innerHTML = `
            <div class="kpi-card" id="kpiCardTotal">
                <div class="kpi-label">${T('Total Assets')}</div>
                <div class="kpi-value" id="kpiTotal">0</div>
                <div class="kpi-hint">${T('click: reset filter')}</div>
            </div>
            <div class="kpi-card success" id="kpiCardActive">
                <div class="kpi-label">${T('Active on Floor')}</div>
                <div class="kpi-value" id="kpiActive">0</div>
                <div class="kpi-hint">${T('click: filter')}</div>
            </div>
            <div class="kpi-card warning" id="kpiCardIssued">
                <div class="kpi-label">${T('Issued to Personnel')}</div>
                <div class="kpi-value" id="kpiIssued">0</div>
                <div class="kpi-hint">${T('click: filter')}</div>
            </div>
            <div class="kpi-card warning" id="kpiCardMaint">
                <div class="kpi-label">${T('Maint. & Cal. Queue')}</div>
                <div class="kpi-value" id="kpiMaint">0</div>
                <div class="kpi-hint">${T('click: filter')}</div>
            </div>
            <div class="kpi-card danger" id="kpiCardOverdue">
                <div class="kpi-label">${T('Overdue Alerts')}</div>
                <div class="kpi-value" id="kpiOverdue">0</div>
                <div class="kpi-hint">${T('click: filter')}</div>
            </div>
        `;

        this.bindEvents();
        this.update();
    }

    private bindEvents(): void {
        const cTotal = this.container.querySelector('#kpiCardTotal');
        const cActive = this.container.querySelector('#kpiCardActive');
        const cIssued = this.container.querySelector('#kpiCardIssued');
        const cMaint = this.container.querySelector('#kpiCardMaint');
        const cOverdue = this.container.querySelector('#kpiCardOverdue');

        if (cTotal) {
            cTotal.addEventListener('click', () => this.onFilterClear());
            cTotal.addEventListener('mousemove', (e) => this.showTooltip(e as MouseEvent, 'Total'));
            cTotal.addEventListener('mouseleave', () => this.hideTooltip());
        }

        if (cActive) {
            cActive.addEventListener('click', () => this.onFilterSelect('status', 'Active'));
            cActive.addEventListener('mousemove', (e) => this.showTooltip(e as MouseEvent, 'Active'));
            cActive.addEventListener('mouseleave', () => this.hideTooltip());
        }

        if (cIssued) {
            cIssued.addEventListener('click', () => this.onFilterSelect('status', 'Issued'));
            cIssued.addEventListener('mousemove', (e) => this.showTooltip(e as MouseEvent, 'Issued'));
            cIssued.addEventListener('mouseleave', () => this.hideTooltip());
        }

        if (cMaint) {
            cMaint.addEventListener('click', () => this.onFilterSelect('status', 'Maintenance'));
            cMaint.addEventListener('mousemove', (e) => this.showTooltip(e as MouseEvent, 'Maintenance'));
            cMaint.addEventListener('mouseleave', () => this.hideTooltip());
        }

        if (cOverdue) {
            cOverdue.addEventListener('click', () => this.onFilterSelect('status', 'Overdue'));
            cOverdue.addEventListener('mousemove', (e) => this.showTooltip(e as MouseEvent, 'Overdue'));
            cOverdue.addEventListener('mouseleave', () => this.hideTooltip());
        }
    }

    public update(): void {
        const activeTools = Store.activeTools();
        const count = (s: string) => activeTools.filter(t => t.status === s).length;

        const totalEl = this.container.querySelector('#kpiTotal');
        const activeEl = this.container.querySelector('#kpiActive');
        const issuedEl = this.container.querySelector('#kpiIssued');
        const maintEl = this.container.querySelector('#kpiMaint');
        const overdueEl = this.container.querySelector('#kpiOverdue');
        const overdueCard = this.container.querySelector('#kpiCardOverdue');

        if (totalEl) totalEl.textContent = String(activeTools.length);
        if (activeEl) activeEl.textContent = String(count('Active'));
        if (issuedEl) issuedEl.textContent = String(count('Issued'));
        if (maintEl) maintEl.textContent = String(count('Maintenance'));

        const overdueCount = count('Overdue');
        if (overdueEl) overdueEl.textContent = String(overdueCount);
        if (overdueCard) overdueCard.classList.toggle('alert', overdueCount > 0);
    }

    private showTooltip(evt: MouseEvent, type: string): void {
        const active = Store.activeTools();
        let text = '';

        if (type === 'Issued') {
            const counts: Record<string, number> = {};
            active.filter(t => t.status === 'Issued').forEach(t => {
                if (t.assigneeId) {
                    const empName = Store.empName(t.assigneeId);
                    counts[empName] = (counts[empName] || 0) + 1;
                }
            });
            const details = Object.entries(counts).map(([n, c]) => `${n}: ${c}`).join(', ');
            text = T('TT_KPI_ISSUED').replace('{n}', String(active.filter(t => t.status === 'Issued').length)) + (details ? ` (${details})` : '');
        } else if (type === 'Maintenance') {
            const maint = active.filter(t => t.status === 'Maintenance');
            const cats: Record<string, number> = {};
            maint.forEach((t: Tool) => {
                const historyArr = t.history || [];
                const last = (historyArr[historyArr.length - 1] || '').toLowerCase();
                const cat = last.includes('calibr') ? T('Calibration') : last.includes('sharpen') ? T('Sharpening') : last.includes('repair') ? T('Repair') : T('Maintenance');
                cats[cat] = (cats[cat] || 0) + 1;
            });
            const details = Object.entries(cats).map(([c, n]) => `${n} ${c}`).join(', ');
            text = T('TT_KPI_MAINT').replace('{n}', String(maint.length)) + (details ? ` (${details})` : '');
        } else if (type === 'Overdue') {
            text = T('TT_KPI_OVERDUE').replace('{n}', String(active.filter(t => t.status === 'Overdue').length));
        } else if (type === 'Active') {
            text = T('TT_KPI_ACTIVE').replace('{n}', String(active.filter(t => t.status === 'Active').length));
        } else if (type === 'Total') {
            text = T('TT_KPI_TOTAL').replace('{n}', String(active.length));
        }

        if (!text) return;

        this.tooltipEl.innerHTML = esc(text);
        this.tooltipEl.style.display = 'block';

        const w = this.tooltipEl.offsetWidth, h = this.tooltipEl.offsetHeight;
        const maxX = window.scrollX + window.innerWidth;
        const maxY = window.scrollY + window.innerHeight;
        let x = evt.pageX + 15, y = evt.pageY + 15;
        if (x + w > maxX - 8) x = evt.pageX - w - 10;
        if (y + h > maxY - 8) y = evt.pageY - h - 10;
        this.tooltipEl.style.left = `${Math.max(window.scrollX + 8, x)}px`;
        this.tooltipEl.style.top = `${Math.max(window.scrollY + 8, y)}px`;
    }

    private hideTooltip(): void {
        this.tooltipEl.style.display = 'none';
    }
}
