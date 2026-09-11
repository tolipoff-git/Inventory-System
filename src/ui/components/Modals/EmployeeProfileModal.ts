// ============================================================================
// 5S Tool Command Center — EmployeeProfileModal Component
// ============================================================================

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { CONFIG } from '../../../config/constants';
import { esc, daysUntil } from '../../../utils/formatters';
import { Employee } from '../../../types/personnel';

export class EmployeeProfileModal {
    private static modalId = 'employeeProfileModal';

    public static open(empIdentifier: string): void {
        const emp = Store.getEmp(empIdentifier);
        if (!emp) return;

        let modal = document.getElementById(this.modalId);
        if (!modal) {
            this.createModalDOM();
            modal = document.getElementById(this.modalId);
        }

        this.populate(emp);
        if (modal) modal.classList.add('active');
    }

    public static close(): void {
        const modal = document.getElementById(this.modalId);
        if (modal) modal.classList.remove('active');
    }

    private static createModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.modalId;

        overlay.innerHTML = `
            <div class="modal wide" style="max-width:850px;">
                <div class="modal-header">
                    <h3 class="modal-title">👤 <span>${T('Employee Tool Audit Profile')}</span></h3>
                    <button class="close-btn" id="empProfileCloseBtn">&times;</button>
                </div>
                <div class="modal-body" style="max-height:75vh; overflow-y:auto;">
                    <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:8px; padding:15px; margin-bottom:15px;">
                        <div style="font-size:1.3rem; font-weight:bold; color:var(--text-main); margin-bottom:6px;" id="empProfileName">Name</div>
                        <div style="font-size:0.85rem; color:var(--text-muted); display:flex; flex-wrap:wrap; gap:12px;">
                            <span><strong>${T('Initials:')}</strong> <span id="empProfileInitials"></span></span>
                            <span>&bull;</span>
                            <span><strong>${T('Badge ID:')}</strong> <span id="empProfileBadge"></span></span>
                            <span>&bull;</span>
                            <span><strong>${T('Workstation:')}</strong> <span id="empProfileWs"></span></span>
                            <span>&bull;</span>
                            <span><strong>${T('Workpost:')}</strong> <span id="empProfilePost"></span></span>
                        </div>
                    </div>

                    <!-- Counters -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-bottom:15px;">
                        <div style="background:rgba(0, 210, 255, 0.1); border:1px solid var(--primary); border-radius:6px; padding:10px; text-align:center;">
                            <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted);">${T('Total Assigned')}</div>
                            <div style="font-size:1.6rem; font-weight:bold; color:var(--primary-hover);" id="empCountTotal">0</div>
                        </div>
                        <div style="background:rgba(255, 23, 68, 0.1); border:1px solid var(--danger); border-radius:6px; padding:10px; text-align:center;">
                            <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted);">${T('Overdue / Late')}</div>
                            <div style="font-size:1.6rem; font-weight:bold; color:var(--danger);" id="empCountOverdue">0</div>
                        </div>
                        <div style="background:rgba(255, 214, 0, 0.1); border:1px solid var(--warning); border-radius:6px; padding:10px; text-align:center;">
                            <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted);">${T('Service Required')}</div>
                            <div style="font-size:1.6rem; font-weight:bold; color:var(--warning);" id="empCountAmber">0</div>
                        </div>
                        <div style="background:rgba(0, 230, 118, 0.1); border:1px solid var(--success); border-radius:6px; padding:10px; text-align:center;">
                            <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted);">OK</div>
                            <div style="font-size:1.6rem; font-weight:bold; color:var(--success);" id="empCountOk">0</div>
                        </div>
                    </div>

                    <!-- Care Score -->
                    <div id="empCareContainer" style="margin-bottom:15px;"></div>

                    <!-- Assigned Tools Table -->
                    <div class="form-group">
                        <label style="font-weight:bold; color:var(--primary-hover); margin-bottom:6px; display:block;">${T('Tool Audit List')}</label>
                        <div class="table-scroll">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Tool ID</th>
                                        <th>${T('Name')}</th>
                                        <th>${T('Status')}</th>
                                        <th>${T('Actions')}</th>
                                    </tr>
                                </thead>
                                <tbody id="empAssignedTable"></tbody>
                            </table>
                        </div>
                    </div>

                    <!-- History -->
                    <div class="form-group" style="margin-top:15px;">
                        <label style="font-weight:bold; color:var(--text-muted); margin-bottom:6px; display:block;">${T('Transaction History')}</label>
                        <ul class="history-list" id="empHistoryList" style="max-height:160px; overflow-y:auto;"></ul>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="empProfileFooterCloseBtn">${T('Close')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#empProfileCloseBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#empProfileFooterCloseBtn')?.addEventListener('click', () => this.close());
    }

    private static populate(emp: Employee): void {
        const nameEl = document.getElementById('empProfileName');
        const wsEl = document.getElementById('empProfileWs');
        const postEl = document.getElementById('empProfilePost');
        const initialsEl = document.getElementById('empProfileInitials');
        const badgeEl = document.getElementById('empProfileBadge');

        if (nameEl) nameEl.textContent = emp.name;
        if (wsEl) wsEl.textContent = emp.ws || 'N/A';
        if (postEl) postEl.textContent = emp.post || 'N/A';
        if (initialsEl) initialsEl.textContent = emp.initials || 'N/A';
        if (badgeEl) badgeEl.textContent = emp.badge || emp.id || 'N/A';

        const assigned = Store.tools.filter(t => t.assigneeId === emp.id && t.status !== 'Decommissioned' && (t.status as any) !== 'Retired');
        let overdue = 0;
        let amber = 0;
        let ok = 0;

        const rows = assigned.map(t => {
            let cls = 'ok';
            let txt = 'OK / IN OPERATION';
            const isOverdue = t.status === 'Overdue' || (t.calDue && daysUntil(t.calDue) !== null && daysUntil(t.calDue)! < 0);
            const calSoon = t.calDue && daysUntil(t.calDue) !== null && daysUntil(t.calDue)! <= CONFIG.CAL_WARNING_DAYS && daysUntil(t.calDue)! >= 0;

            if (isOverdue) {
                cls = 'overdue';
                txt = 'OVERDUE / LATE RETURN';
                overdue++;
            } else if (calSoon || t.status === 'Maintenance') {
                cls = 'amber';
                txt = 'NEEDS INSPECTION / CAL. DUE';
                amber++;
            } else {
                ok++;
            }

            const bg = cls === 'overdue' ? 'rgba(220,20,60,0.15)' : cls === 'amber' ? 'rgba(255,183,0,0.15)' : 'rgba(0,230,118,0.1)';
            const borderCol = cls === 'overdue' ? 'var(--danger)' : cls === 'amber' ? 'var(--warning)' : 'var(--success)';

            return `
                <tr style="background:${bg};">
                    <td><strong style="font-family:var(--font-mono);">${esc(t.id)}</strong></td>
                    <td>${esc(t.name)}</td>
                    <td><span style="font-weight:bold; font-size:0.8rem; color:${borderCol};">${txt}</span></td>
                    <td style="white-space:nowrap;">
                        <button class="btn btn-warning btn-sm" style="padding:3px 8px; font-size:0.8rem;" data-action="return" data-id="${esc(t.id)}">${T('Return')}</button>
                        <button class="btn btn-danger btn-sm" style="padding:3px 8px; font-size:0.8rem;" data-action="service" data-id="${esc(t.id)}">${T('Service')}</button>
                        <button class="btn btn-sm" style="padding:3px 8px; font-size:0.8rem;" data-action="print-label" data-id="${esc(t.id)}">🖨 ${T('Label')}</button>
                    </td>
                </tr>
            `;
        }).join('');

        const tableBody = document.getElementById('empAssignedTable');
        if (tableBody) {
            tableBody.innerHTML = rows || `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:16px;">${T('No tools currently assigned.')}</td></tr>`;
        }

        const totalEl = document.getElementById('empCountTotal');
        const overdueEl = document.getElementById('empCountOverdue');
        const amberEl = document.getElementById('empCountAmber');
        const okEl = document.getElementById('empCountOk');

        if (totalEl) totalEl.textContent = String(assigned.length);
        if (overdueEl) overdueEl.textContent = String(overdue);
        if (amberEl) amberEl.textContent = String(amber);
        if (okEl) okEl.textContent = String(ok);

        // 5S Care score
        const careScore = emp.careScore ?? (assigned.length === 0 ? 100 : Math.max(20, 100 - (overdue * 25) - (amber * 10)));
        const careColor = careScore >= 80 ? 'var(--success)' : careScore >= 60 ? 'var(--warning)' : 'var(--danger)';
        const grade = careScore >= 90 ? 'A' : careScore >= 80 ? 'B' : careScore >= 70 ? 'C' : careScore >= 60 ? 'D' : 'F';
        const careContainer = document.getElementById('empCareContainer');

        if (careContainer) {
            careContainer.innerHTML = `
                <div style="display:flex; align-items:center; gap:15px; flex-wrap:wrap; background:rgba(0,0,0,0.25); border:1px solid ${careColor}; border-radius:6px; padding:12px 15px;">
                    <div style="text-align:center; min-width:90px;">
                        <div style="font-size:2rem; font-weight:bold; color:${careColor}; line-height:1;">${careScore}%</div>
                        <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; margin-top:2px;">${T('Care Score')} &bull; ${T('Grade')} ${grade}</div>
                    </div>
                    <div style="flex:1; min-width:200px; font-size:0.85rem;">
                        <div style="color:${careColor}; font-weight:bold; margin-bottom:4px;">5S Asset Handling Rating</div>
                        <div style="color:var(--text-muted);">
                            <span style="color:var(--success);">${ok} &check; Good</span> &bull;
                            <span style="color:var(--warning);">${amber} &bull; Service / Cal. Due</span> &bull;
                            <span style="color:var(--danger);">${overdue} &bull; Overdue</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // History
        const historyList = document.getElementById('empHistoryList');
        if (historyList) {
            const hist = (emp as any).history || [];
            if (!hist.length) {
                historyList.innerHTML = `<li class="history-item"><span style="color:var(--text-muted)">No transaction records.</span></li>`;
            } else {
                historyList.innerHTML = hist.map((h: string) => `<li class="history-item"><span>${esc(h)}</span></li>`).join('');
            }
        }
    }
}
