// ============================================================================
// 5S Tool Command Center — ChartsView Component
// ============================================================================

import { T } from '../../i18n';
import { Store } from '../../storage/store';
import { CONFIG } from '../../config/constants';
import { esc } from '../../utils/formatters';
import { renderDonutSvg, renderBarSvg, renderRadarSvg, RadarPoint } from '../../reports/radarChart';

export interface ChartsCallbacks {
    onFilterSelect: (type: string, value: string) => void;
    onOpenAuditHistory: (pillarIdx?: number) => void;
    onCompleteMaint: (toolId: string) => void;
}

export class ChartsViewComponent {
    private container: HTMLElement;
    private callbacks: ChartsCallbacks;
    private cardState: Record<string, number>;

    constructor(container: HTMLElement, callbacks: ChartsCallbacks) {
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
        const openByDefault = ['chart1'];
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
            } catch (e) {
                console.error('[ChartsView:setCardCollapsed] Failed to persist card state:', e);
            }
        }
    }

    public render(): void {
        this.container.className = 'dashboard-charts';
        this.container.innerHTML = `
            <div class="chart-card ${this.isCardCollapsed('chart1') ? 'collapsed' : ''}" data-card-key="chart1">
                <h3 class="collapse-toggle" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                    <span>${T('Tool Status Breakdown')}</span>
                    <span class="collapse-chevron">▾</span>
                </h3>
                <div class="collapsible"><div class="collapsible-inner">
                    <svg id="chart1" width="100%" height="200" viewBox="0 0 300 200"></svg>
                </div></div>
            </div>

            <div class="chart-card ${this.isCardCollapsed('chart2') ? 'collapsed' : ''}" data-card-key="chart2">
                <h3 class="collapse-toggle" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                    <span>${T('Workstation Tool Load')}</span>
                    <span class="collapse-chevron">▾</span>
                </h3>
                <div class="collapsible"><div class="collapsible-inner">
                    <svg id="chart2" width="100%" height="200" viewBox="0 0 320 200"></svg>
                </div></div>
            </div>

            <div class="chart-card ${this.isCardCollapsed('chart3') ? 'collapsed' : ''}" data-card-key="chart3">
                <h3 class="collapse-toggle" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                    <span>${T('Risk Index & Incidents')}</span>
                    <span class="collapse-chevron">▾</span>
                </h3>
                <div class="collapsible"><div class="collapsible-inner">
                    <div style="max-height:230px; overflow-y:auto;">
                        <svg id="chartCulture" width="100%" height="200" viewBox="0 0 300 200"></svg>
                        <div id="chart3-table" style="font-size:0.85rem;"></div>
                    </div>
                </div></div>
            </div>

            <div class="chart-card ${this.isCardCollapsed('chart4') ? 'collapsed' : ''}" data-card-key="chart4">
                <h3 class="collapse-toggle" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                    <span>${T('5S Audit Radar')}</span>
                    <span class="collapse-chevron">▾</span>
                </h3>
                <div class="collapsible"><div class="collapsible-inner">
                    <svg id="chartRadar" width="100%" height="200" viewBox="0 0 300 200"></svg>
                    <div style="text-align:center; font-size:0.78rem; color:var(--text-muted); margin-top:4px;">
                        ${T('RADAR_CLICK_HINT')}
                    </div>
                </div></div>
            </div>
        `;

        this.bindEvents();
        this.update();
    }

    private bindEvents(): void {
        this.container.querySelectorAll('.collapse-toggle').forEach(el => {
            el.addEventListener('click', (e) => {
                this.toggleCard(e.currentTarget as HTMLElement);
            });
        });
    }

    public update(): void {
        this.renderStatusChart();
        this.renderWsChart();
        this.renderCultureChart();
        this.renderRadarChart();
    }

    private renderStatusChart(): void {
        const active = Store.activeTools();
        const counts: Record<string, number> = {
            Active: 0,
            Issued: 0,
            Maintenance: 0,
            Overdue: 0
        };
        active.forEach(t => {
            if (counts[t.status] !== undefined) counts[t.status]++;
        });

        renderDonutSvg('chart1', counts, (status) => {
            this.callbacks.onFilterSelect('status', status);
        });
    }

    private renderWsChart(): void {
        const active = Store.activeTools();
        const wsCounts: Record<string, number> = {};
        Store.workstations.forEach(ws => { wsCounts[ws] = 0; });

        active.forEach(t => {
            const ws = Store.workstationOf(t);
            if (ws && wsCounts[ws] !== undefined) {
                wsCounts[ws]++;
            }
        });

        renderBarSvg('chart2', wsCounts, (ws) => {
            this.callbacks.onFilterSelect('workstation', ws);
        });
    }

    private renderCultureChart(): void {
        const culture = this.computeCulture();
        const cultureData: RadarPoint[] = culture.map(c => ({
            pillar: c.pillar,
            score: c.score,
            desc: c.desc,
            onClick: c.onClick
        }));

        renderRadarSvg('chartCulture', cultureData, { max: 100, rings: 4, fill: 'rgba(255, 140, 0, 0.25)' });
        this.renderRiskPanel();
    }

    private renderRadarChart(): void {
        const points = this.compute5S();
        renderRadarSvg('chartRadar', points, { max: 5, rings: 5, fill: 'rgba(0, 210, 255, 0.25)' });
    }

    private compute5S(): RadarPoint[] {
        const PILLARS = ['Sort', 'Set in Order', 'Shine', 'Standardize', 'Sustain'];
        const validAudits = (Store.audits5s || []).filter(a =>
            Store.workposts.some(p => p.name === a.post && p.ws === a.ws));

        if (validAudits.length) {
            const latest: Record<string, any> = {};
            validAudits.forEach(a => {
                const k = `${a.ws}|${a.post}`;
                if (!latest[k] || String(a.date) > String(latest[k].date)) latest[k] = a;
            });
            const posts = Object.values(latest);

            return PILLARS.map((p, pi) => {
                const rubricKey = ['sort', 'setOrder', 'shine', 'standardize', 'sustain'][pi];
                const ranked = [...posts].sort((a, b) => (b.scores[rubricKey] || 0) - (a.scores[rubricKey] || 0));
                const best = ranked[0];
                const avg = posts.reduce((s, a) => s + (a.scores[rubricKey] || 0), 0) / posts.length;
                const fmt = (a: any) => `${a.ws} | ${a.post}`;
                const desc = `${fmt(best)} — Score: ${best.scores[rubricKey]}/5`;
                return {
                    pillar: T(p),
                    score: Math.max(1, Math.min(5, Math.round(avg))),
                    desc,
                    onClick: () => this.callbacks.onOpenAuditHistory(pi)
                };
            });
        }

        const active = Store.activeTools();
        if (!active.length) {
            return PILLARS.map(p => ({ pillar: T(p), score: 3, desc: T('No data yet.') }));
        }

        const clamp = (r: number) => Math.max(1, Math.min(5, Math.round(1 + 4 * r)));
        const withLocation = active.filter(t => t.location && t.location !== 'Pending').length / active.length;
        const addressed = active.filter(t => t.assigneeId || (t.location && (t.location.includes('-') || Store.workstations.some(w => t.location.includes(w))))).length / active.length;
        const avgWear = active.reduce((a, t) => a + Store.wearOf(t), 0) / active.length;
        const standardized = active.filter(t => (t.sn || t.article) && t.category && t.spec && t.spec !== 'N/A').length / active.length;
        const compliant = active.filter(t => t.status !== 'Overdue').length / active.length;

        return [
            { pillar: T('Sort'), score: clamp(withLocation), desc: `${Math.round(withLocation * 100)}% tools have a defined place.` },
            { pillar: T('Set in Order'), score: clamp(addressed), desc: `${Math.round(addressed * 100)}% at address storage or assigned.` },
            { pillar: T('Shine'), score: Math.max(1, Math.min(5, Math.round(5 - avgWear / 20))), desc: `Average wear ${Math.round(avgWear)}%.` },
            { pillar: T('Standardize'), score: clamp(standardized), desc: `${Math.round(standardized * 100)}% have SN, category and spec.` },
            { pillar: T('Sustain'), score: clamp(compliant), desc: `${Math.round(compliant * 100)}% not overdue.` }
        ];
    }

    private computeCulture(): Array<{ pillar: string; score: number; desc: string; rated: boolean; onClick?: () => void }> {
        const pillars = Store.workstations;
        return pillars.map(pillar => {
            const tools = Store.activeTools().filter(t => Store.workstationOf(t) === pillar);
            if (!tools.length) {
                return { pillar, score: 0, desc: '0 tools', rated: false };
            }
            const cleanRate = tools.filter(t => t.status !== 'Overdue' && t.status !== 'Maintenance').length / tools.length;
            const score = Math.round(cleanRate * 100);
            return {
                pillar,
                score,
                desc: `${tools.length} tools · ${score}/100`,
                rated: true,
                onClick: () => this.callbacks.onFilterSelect('workstation', pillar)
            };
        });
    }

    private renderRiskPanel(): void {
        const tableContainer = this.container.querySelector('#chart3-table');
        if (!tableContainer) return;

        const maintTools = Store.activeTools().filter(t => t.status === 'Maintenance');
        const maintCards = maintTools.map(t => {
            const loc = Store.workstationOf(t);
            const history = t.history || [];
            const reason = history.length ? history[history.length - 1] : T('Routine Service');

            return `
            <div style="background:rgba(0,0,0,0.3); border:1px solid var(--warning); border-radius:4px; padding:10px; margin-bottom:8px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:6px; gap:8px;">
                    <strong style="color:var(--text-main); font-size:0.9rem;">${esc(t.id)} — ${esc(t.name)}</strong>
                    <span style="font-size:0.8rem; background:var(--warning); color:#000; padding:2px 7px; border-radius:3px; white-space:nowrap;">${esc(t.category)}</span>
                </div>
                <div style="font-size:0.88rem; margin-bottom:8px; color:var(--text-main);">
                    <strong>${loc}</strong> | ${T('Reason:')} ${esc(reason)}
                </div>
                <button class="btn btn-success" style="font-size:0.85rem; padding:7px; width:100%;" data-action="complete-maint" data-id="${esc(t.id)}">
                    ${T('[Complete Maintenance]')}
                </button>
            </div>`;
        }).join('') || `<div style="color:var(--text-muted); font-size:0.9rem; padding:10px;">${T('No tools currently in maintenance.')}</div>`;

        const consumables = Store.activeTools().filter(t => t.type === 'Consumable' || CONFIG.CONSUMABLE_PREFIXES.some(p => t.id.startsWith(p)));
        const wearRows = consumables.map(t => {
            const wear = Store.wearOf(t);
            const color = wear > CONFIG.WEAR_RETIRE_PCT ? 'var(--danger)' : wear > CONFIG.WEAR_WARN_PCT ? 'var(--warning)' : 'var(--success)';
            return `
            <div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:6px; border-bottom:1px dashed var(--border); padding-bottom:4px;">
                <span style="color:var(--text-main);">${esc(t.id)} — ${esc(t.name)}</span>
                <strong style="color:${color}">${wear}% ${T('Wear')}</strong>
            </div>`;
        }).join('') || `<div style="font-size:0.9rem; color:var(--text-muted);">${T('No consumables found.')}</div>`;

        tableContainer.innerHTML = `
            <h4 style="color:var(--primary-hover); margin:10px 0 8px; text-transform:uppercase; font-size:0.9rem; border-bottom:1px solid var(--border); padding-bottom:5px;">
                ${T('Maintenance & Repair Queue')}
            </h4>
            <div>${maintCards}</div>
            <h4 style="color:var(--primary-hover); margin:12px 0 8px; text-transform:uppercase; font-size:0.9rem; border-bottom:1px solid var(--border); padding-bottom:5px;">
                ${T('Consumable Wear Trends')}
            </h4>
            <div style="background:rgba(0,0,0,0.2); border:1px solid var(--border); padding:10px; border-radius:4px;">
                ${wearRows}
            </div>
        `;

        tableContainer.querySelectorAll('[data-action="complete-maint"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const toolId = target.dataset.id;
                if (toolId) this.callbacks.onCompleteMaint(toolId);
            });
        });
    }
}
