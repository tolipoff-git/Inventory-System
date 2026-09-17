// ============================================================================
// 5S Tool Command Center — ChartsView Component
// ============================================================================

import { T } from '../../i18n';
import { Store } from '../../storage/store';
import { CONFIG } from '../../config/constants';
import { esc } from '../../utils/formatters';
import { showTooltip, hideTooltip } from '../../utils/tooltip';
import { workstationAndPostOf, statusBucket } from '../../operations/toolOps';
import { renderDonutSvg, renderBarSvg, renderRadarSvg, RadarPoint } from '../../reports/radarChart';
import { computeRiskGroups } from '../../reports/riskIndex';
import { compute5SPillars } from '../../reports/s5Scores';

export interface ChartsCallbacks {
    onFilterSelect: (type: string, value: string) => void;
    onOpenAuditHistory: (pillarIdx?: number) => void;
    onCompleteMaint: (toolId: string) => void;
    onOpenRiskDetail: (ws: string, post: string) => void;
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
                        <div style="text-align:center; font-size:0.78rem; color:var(--text-muted); margin-top:4px;">
                            ${T('CULTURE_LEGEND')}
                        </div>
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
        // Work mode hides all analytics — skip the computation (monolith parity)
        if (document.body.classList.contains('work-mode') || document.body.classList.contains('mode-work')) return;
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
            Backup: 0,
            Maintenance: 0,
            Overdue: 0
        };
        active.forEach(t => {
            const bucket = statusBucket(t.status);
            counts[bucket] = (counts[bucket] || 0) + 1;
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
            const ws = workstationAndPostOf(t).ws || 'Unknown';
            wsCounts[ws] = (wsCounts[ws] || 0) + 1;
        });

        renderBarSvg('chart2', wsCounts, (ws) => {
            this.callbacks.onFilterSelect('workstation', ws);
        });
    }

    private renderCultureChart(): void {
        const culture = this.computeCulture();
        renderRadarSvg('chartCulture', culture, {
            max: 100,
            rings: 4,
            fill: 'rgba(69, 162, 158, 0.18)',
            stroke: 'var(--primary)',
        });
        this.renderRiskPanel();
    }

    private renderRadarChart(): void {
        const points = this.compute5S();
        renderRadarSvg('chartRadar', points, { max: 5, rings: 5, fill: 'rgba(0, 210, 255, 0.25)' });
    }

    private compute5S(): RadarPoint[] {
        // Shared with the 5S report so the radar and the document always agree.
        return compute5SPillars().map(p => ({
            pillar: p.pillar,
            score: p.score,
            desc: p.descHtml,
            onClick: () => this.callbacks.onOpenAuditHistory(p.index)
        }));
    }

    private computeCulture(): RadarPoint[] {
        const groups = computeRiskGroups();

        const data: RadarPoint[] = groups.map(g => {
            const reasons = g.score >= 80
                ? `★ ${T('High Reliability:')} 0 Overdue, low maintenance, low average wear (${g.avgWear}%). Assigned: ${esc(g.persona)}`
                : `▼ ${T('Rating Drivers / Risk Factors:')} Overdue items (${g.overdue}), Maintenance items (${g.maintenance}), Wear penalty (${g.avgWear}%). Assigned: ${esc(g.persona)}`;

            const tooltipHtml = `<div style="padding:6px; font-size:0.82rem; line-height:1.4;"><strong style="color:var(--primary-hover);">${esc(g.label)}</strong><br><strong>${T('Risk Index')}:</strong> ${g.score}/100<br><strong>${T('Program:')}</strong> ${esc(g.program)}<br><strong>${T('Persona / Responsible:')}</strong> ${esc(g.persona)}<br><div style="margin-top:4px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.15);">${esc(reasons)}</div></div>`;

            return {
                pillar: g.label,
                score: g.score,
                rated: true,
                desc: reasons,
                tooltipHtml,
                onClick: () => this.callbacks.onOpenRiskDetail(g.ws, g.post)
            };
        });

        const rated = data.filter(d => d.rated);
        const best = rated.length ? rated.reduce((a, b) => (b.score > a.score ? b : a)) : null;
        const worst = rated.length ? rated.reduce((a, b) => (b.score < a.score ? b : a)) : null;
        data.forEach(d => {
            if (d === best && best!.score !== worst!.score) { d.color = 'var(--success)'; d.mark = '★'; }
            else if (d === worst && best!.score !== worst!.score) { d.color = 'var(--danger)'; d.mark = '▼'; }
        });

        return data;
    }

    private renderRiskPanel(): void {
        const tableContainer = this.container.querySelector('#chart3-table');
        if (!tableContainer) return;

        const maintTools = Store.activeTools().filter(t => t.status === 'Maintenance');
        const maintCards = maintTools.map(t => {
            const loc = workstationAndPostOf(t);
            const history = t.history || [];
            const reason = history.length ? history[history.length - 1] : T('Routine Service');
            const progs = (t as any).program || Store.wsProgram[loc.ws] || 'N/A';
            const emp = t.assigneeId ? Store.getEmp(t.assigneeId) : null;
            const persona = emp ? emp.name : (t.assigneeId || 'Unassigned / Team');
            const hasPost = loc.post && loc.post !== 'Unknown' && loc.post !== loc.ws;
            const locLabel = hasPost ? `${loc.ws} | ${loc.post}` : loc.ws;
            const tooltipHtml = `<div style="padding:6px; font-size:0.82rem; line-height:1.4;"><strong style="color:var(--primary-hover);">${esc(locLabel)}</strong><br><strong>${T('Program:')}</strong> ${esc(progs)}<br><strong>${T('Persona / Responsible:')}</strong> ${esc(persona)}<br><div style="margin-top:4px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.15);">${esc(reason)}</div></div>`;

            return `
            <div data-tip="${esc(tooltipHtml)}" style="background:rgba(0,0,0,0.3); border:1px solid var(--warning); border-radius:4px; padding:10px; margin-bottom:8px; cursor:help;">
                <div style="display:flex; justify-content:space-between; margin-bottom:6px; gap:8px;">
                    <strong style="color:var(--text-main); font-size:0.9rem;">${esc(t.id)} — ${esc(t.name)}</strong>
                    <span style="font-size:0.8rem; background:var(--warning); color:#000; padding:2px 7px; border-radius:3px; white-space:nowrap;">${esc(t.category)}</span>
                </div>
                <div style="font-size:0.88rem; margin-bottom:8px; color:var(--text-main);">
                    <strong>${esc(locLabel)}</strong> | ${T('Reason:')} ${esc(reason)}
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
            const loc = workstationAndPostOf(t);
            const progs = (t as any).program || Store.wsProgram[loc.ws] || 'N/A';
            const emp = t.assigneeId ? Store.getEmp(t.assigneeId) : null;
            const persona = emp ? emp.name : (t.assigneeId || 'Unassigned / Team');
            const hasPost = loc.post && loc.post !== 'Unknown' && loc.post !== loc.ws;
            const locLabel = hasPost ? `${loc.ws} | ${loc.post}` : loc.ws;
            const tooltipHtml = `<div style="padding:6px; font-size:0.82rem; line-height:1.4;"><strong style="color:var(--primary-hover);">${esc(locLabel)}</strong><br><strong>${T('Program:')}</strong> ${esc(progs)}<br><strong>${T('Persona / Responsible:')}</strong> ${esc(persona)}<br><div style="margin-top:4px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.15);">${T('Wear:')} ${wear}%</div></div>`;
            return `
            <div data-tip="${esc(tooltipHtml)}" style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:6px; border-bottom:1px dashed var(--border); padding-bottom:4px; cursor:help;">
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

        tableContainer.querySelectorAll('[data-tip]').forEach(el => {
            const tipEl = el as HTMLElement;
            tipEl.addEventListener('mousemove', (e) => showTooltip(e as MouseEvent, tipEl.dataset.tip || ''));
            tipEl.addEventListener('mouseleave', () => hideTooltip());
        });

        tableContainer.querySelectorAll('[data-action="complete-maint"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const toolId = target.dataset.id;
                if (toolId) this.callbacks.onCompleteMaint(toolId);
            });
        });
    }
}
