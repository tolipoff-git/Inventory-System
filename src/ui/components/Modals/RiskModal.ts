// ============================================================================
// 5S Tool Command Center — RiskModal Component
// Detailed risk breakdown for one station | post group, opened by clicking a
// node of the "Risk Index & Incidents" chart.
// ============================================================================

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { esc } from '../../../utils/formatters';
import { computeRiskGroups } from '../../../reports/riskIndex';
import { AuditModal } from './AuditModal';

export class RiskModal {
    private static modalId = 'riskDetailModal';
    private static current: { ws: string; post: string } | null = null;

    public static open(ws: string, post: string): void {
        this.current = { ws, post };
        let modal = document.getElementById(this.modalId);
        if (!modal) {
            this.createModalDOM();
            modal = document.getElementById(this.modalId);
        }
        this.render();
        if (modal) modal.classList.add('active');
    }

    public static close(): void {
        const modal = document.getElementById(this.modalId);
        if (modal) modal.classList.remove('active');
        this.current = null;
    }

    private static createModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.modalId;

        overlay.innerHTML = `
            <div class="modal wide" style="max-width:720px;">
                <div class="modal-header">
                    <h3 class="modal-title" id="riskDetailTitle">⚠ ${T('Risk Detail')}</h3>
                    <button class="close-btn" id="riskDetailCloseBtn">&times;</button>
                </div>
                <div class="modal-body" style="max-height:75vh; overflow-y:auto;" id="riskDetailBody"></div>
                <div class="modal-footer">
                    <button class="btn btn-warning" id="riskDetailReportBtn">📋 ${T('Open 5S Report')}</button>
                    <button class="btn btn-muted" id="riskDetailFooterCloseBtn">${T('Close')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#riskDetailCloseBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#riskDetailFooterCloseBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#riskDetailReportBtn')?.addEventListener('click', () => {
            this.close();
            AuditModal.openReport();
        });
    }

    private static render(): void {
        const body = document.getElementById('riskDetailBody');
        const title = document.getElementById('riskDetailTitle');
        if (!this.current || !body) return;

        const group = computeRiskGroups().find(g => g.ws === this.current!.ws && g.post === this.current!.post);
        if (title) title.textContent = `⚠ ${T('Risk Detail')} — ${group ? group.label : this.current.ws}`;

        if (!group) {
            body.innerHTML = `<div style="color:var(--text-muted); padding:10px;">${T('RISK_GROUP_EMPTY')}</div>`;
            return;
        }

        const level = group.score >= 80 ? T('Low') : group.score >= 60 ? T('Medium') : T('High');
        const levelColor = group.score >= 80 ? 'var(--success)' : group.score >= 60 ? 'var(--warning)' : 'var(--danger)';

        const summary = T('RISK_SUMMARY')
            .replace('{score}', String(group.score))
            .replace('{level}', level)
            .replace('{overdue}', String(group.overdue))
            .replace('{maintenance}', String(group.maintenance))
            .replace('{wear}', String(group.avgWear));

        const factors: string[] = [];
        if (group.overdue) factors.push(`${group.overdue} ${T('Overdue').toLowerCase()}`);
        if (group.maintenance) factors.push(`${group.maintenance} ${T('Maintenance').toLowerCase()}`);
        if (group.avgWear > 50) factors.push(`${T('Average wear').toLowerCase()} ${group.avgWear}%`);
        const drivers = factors.length
            ? `${T('Rating Drivers / Risk Factors:')} ${factors.join(', ')}`
            : T('No risk factors');

        const toolRows = group.tools.map(t => {
            const wear = Store.wearOf(t);
            const wearColor = wear > 75 ? 'var(--danger)' : wear > 50 ? 'var(--warning)' : 'var(--success)';
            const statusColor = t.status === 'Overdue' ? 'var(--danger)' : t.status === 'Maintenance' ? 'var(--warning)' : 'var(--text-main)';
            return `
            <tr>
                <td style="padding:6px 10px; border-bottom:1px solid var(--border);"><strong>${esc(t.id)}</strong></td>
                <td style="padding:6px 10px; border-bottom:1px solid var(--border);">${esc(t.name)}</td>
                <td style="padding:6px 10px; border-bottom:1px solid var(--border); color:${statusColor}; font-weight:bold;">${esc(T(t.status) || t.status)}</td>
                <td style="padding:6px 10px; border-bottom:1px solid var(--border); text-align:center; color:${wearColor};">${wear}%</td>
            </tr>`;
        }).join('');

        const kpi = (value: string, label: string, color: string) => `
            <div style="flex:1; min-width:120px; background:rgba(0,0,0,0.25); border:1px solid var(--border); border-radius:6px; padding:12px; text-align:center;">
                <div style="font-size:1.6rem; font-weight:bold; color:${color};">${value}</div>
                <div style="color:var(--text-muted); font-size:0.78rem; text-transform:uppercase;">${label}</div>
            </div>`;

        body.innerHTML = `
            <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:16px;">
                ${kpi(String(group.score), `${T('Risk Index')} / 100`, levelColor)}
                ${kpi(String(group.overdue), T('Overdue'), group.overdue ? 'var(--danger)' : 'var(--success)')}
                ${kpi(String(group.maintenance), T('Maintenance'), group.maintenance ? 'var(--warning)' : 'var(--success)')}
                ${kpi(`${group.avgWear}%`, T('Average wear'), group.avgWear > 75 ? 'var(--danger)' : group.avgWear > 50 ? 'var(--warning)' : 'var(--success)')}
            </div>

            <div style="font-size:0.92rem; line-height:1.6; margin-bottom:14px;">
                <div><strong>${T('Program:')}</strong> ${esc(group.program)}</div>
                <div><strong>${T('Persona / Responsible:')}</strong> ${esc(group.persona)}</div>
                <div><strong>${T('Risk level')}:</strong> <span style="color:${levelColor}; font-weight:bold;">${level}</span></div>
            </div>

            <h4 style="color:var(--primary-hover); margin:10px 0 8px; text-transform:uppercase; font-size:0.9rem; border-bottom:1px solid var(--border); padding-bottom:5px;">
                ${T('Summary')}
            </h4>
            <div style="font-size:0.9rem; margin-bottom:16px;">
                <div>${esc(summary)}</div>
                <div style="color:var(--text-muted); margin-top:4px;">${esc(drivers)}</div>
            </div>

            <h4 style="color:var(--primary-hover); margin:10px 0 8px; text-transform:uppercase; font-size:0.9rem; border-bottom:1px solid var(--border); padding-bottom:5px;">
                ${T('Tools:')} (${group.tools.length})
            </h4>
            <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
                <thead>
                    <tr style="background:var(--border-dark);">
                        <th style="padding:8px 10px; text-align:left;">ID</th>
                        <th style="padding:8px 10px; text-align:left;">${T('Name')}</th>
                        <th style="padding:8px 10px; text-align:left;">${T('Status')}</th>
                        <th style="padding:8px 10px; text-align:center;">${T('Wear %')}</th>
                    </tr>
                </thead>
                <tbody>${toolRows}</tbody>
            </table>
        `;
    }
}
