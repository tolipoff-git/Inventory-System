// ============================================================================
// 5S Tool Command Center — FilterBar Component
// ============================================================================

import { T } from '../../i18n';

export interface FilterBarCallbacks {
    onSearch: (query: string) => void;
    onStatusFilterChange: (status: string) => void;
    onResetFilter: () => void;
    onScanClick: () => void;
    onViewModeChange: (mode: 'category' | 'grid') => void;
}

export class FilterBarComponent {
    private container: HTMLElement;
    private callbacks: FilterBarCallbacks;
    private currentFilter: { type: string | null; value: string | null } = { type: null, value: null };
    private currentViewMode: 'category' | 'grid' = 'category';

    constructor(container: HTMLElement, callbacks: FilterBarCallbacks) {
        this.container = container;
        this.callbacks = callbacks;
    }

    public render(): void {
        const prevSearch = this.container.querySelector<HTMLInputElement>('#globalSearch')?.value || '';
        const prevFilterType = this.currentFilter.type;
        const prevFilterValue = this.currentFilter.value;

        this.container.innerHTML = `
            <!-- Filter Indicator -->
            <div id="filterIndicator" style="display:none; margin-bottom:12px; padding:8px 14px; background:rgba(0, 210, 255, 0.15); border:1px solid var(--primary); border-radius:6px; justify-content:space-between; align-items:center;">
                <span id="filterText" style="font-weight:600; color:var(--text-main);"></span>
                <button class="btn btn-muted" id="resetFilterBtn" style="padding:4px 10px; font-size:0.8rem;">${T('Reset Filter')}</button>
            </div>

            <!-- Global Search & QR -->
            <div class="search-bar">
                <input type="text" id="globalSearch" placeholder="${T('SEARCH_PH')}" class="form-control" style="flex:1;">
                <select id="workStatusFilter" class="form-control work-only" style="display:none; width:auto;">
                    <option value="">${T('All Statuses')}</option>
                    <option value="Active">${T('Active')}</option>
                    <option value="Issued">${T('Issued')}</option>
                    <option value="Maintenance">${T('Maintenance')}</option>
                    <option value="Overdue">${T('Overdue')}</option>
                </select>
                <button class="btn" id="qrScanBtn" title="Scan QR with camera" style="flex-shrink:0; font-size:1.1rem; padding:10px 16px;">📷 QR</button>
            </div>

            <!-- View Switcher -->
            <div class="view-switcher" style="margin-top:14px; margin-bottom:14px; display:flex; gap:10px;">
                <button id="btnCategoryView" class="btn ${this.currentViewMode === 'category' ? 'active' : ''}">
                    🎛 <span>${T('Category Hub View')}</span>
                </button>
                <button id="btnGridView" class="btn ${this.currentViewMode === 'grid' ? 'active' : ''}">
                    📋 <span>${T('All Tools Detailed Grid')}</span>
                </button>
            </div>
        `;

        this.bindEvents();

        if (prevSearch) {
            const searchInput = this.container.querySelector<HTMLInputElement>('#globalSearch');
            if (searchInput) searchInput.value = prevSearch;
        }

        if (prevFilterType && prevFilterValue) {
            this.setFilter(prevFilterType, prevFilterValue);
        }
    }

    private bindEvents(): void {
        const searchInput = this.container.querySelector<HTMLInputElement>('#globalSearch');
        if (searchInput) {
            let searchTimeout: any = null;
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.callbacks.onSearch(searchInput.value.trim().toLowerCase());
                }, 150);
            });
        }

        const statusSelect = this.container.querySelector<HTMLSelectElement>('#workStatusFilter');
        if (statusSelect) {
            statusSelect.addEventListener('change', () => {
                this.callbacks.onStatusFilterChange(statusSelect.value);
            });
        }

        const resetBtn = this.container.querySelector('#resetFilterBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.clearFilter();
                const searchInput = this.container.querySelector<HTMLInputElement>('#globalSearch');
                if (searchInput) searchInput.value = '';
                this.callbacks.onSearch('');
                this.callbacks.onResetFilter();
            });
        }

        const qrBtn = this.container.querySelector('#qrScanBtn');
        if (qrBtn) {
            qrBtn.addEventListener('click', () => {
                this.callbacks.onScanClick();
            });
        }

        const catViewBtn = this.container.querySelector('#btnCategoryView');
        if (catViewBtn) {
            catViewBtn.addEventListener('click', () => {
                this.setViewMode('category');
            });
        }

        const gridViewBtn = this.container.querySelector('#btnGridView');
        if (gridViewBtn) {
            gridViewBtn.addEventListener('click', () => {
                this.setViewMode('grid');
            });
        }
    }

    public setFilter(type: string, value: string): void {
        this.currentFilter = { type, value };
        const indicator = this.container.querySelector<HTMLElement>('#filterIndicator');
        const textEl = this.container.querySelector('#filterText');

        if (indicator && textEl) {
            let label = value;
            if (type === 'location_qr') {
                const parts = value.split(':');
                label = `Location (${parts.slice(2).filter(Boolean).join(' → ')})`;
            }
            textEl.textContent = `${T('Filtered by:')} ${type.toUpperCase()} = ${label}`;
            indicator.style.display = 'flex';
        }
    }

    public clearFilter(): void {
        this.currentFilter = { type: null, value: null };
        const indicator = this.container.querySelector<HTMLElement>('#filterIndicator');
        if (indicator) indicator.style.display = 'none';
    }

    public getFilter(): { type: string | null; value: string | null } {
        return this.currentFilter;
    }

    public setViewMode(mode: 'category' | 'grid'): void {
        this.currentViewMode = mode;
        const catBtn = this.container.querySelector('#btnCategoryView');
        const gridBtn = this.container.querySelector('#btnGridView');
        if (catBtn) catBtn.classList.toggle('active', mode === 'category');
        if (gridBtn) gridBtn.classList.toggle('active', mode === 'grid');
        this.callbacks.onViewModeChange(mode);
    }

    public getViewMode(): 'category' | 'grid' {
        return this.currentViewMode;
    }
}
