// ============================================================================
// 5S Tool Command Center — IntegrityModal Component (Database Self-Diagnostic)
// ============================================================================

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { esc } from '../../../utils/formatters';
import { toast } from '../../../utils/dom';

export class IntegrityModal {
    private static modalId = 'integrityModal';

    public static open(): void {
        let modal = document.getElementById(this.modalId);
        if (!modal) {
            this.createModalDOM();
            modal = document.getElementById(this.modalId);
        }

        this.runDiagnostic();
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
            <div class="modal" style="max-width:600px;">
                <div class="modal-header">
                    <h3 class="modal-title">🩺 ${T('Integrity Check')}</h3>
                    <button class="close-btn" id="integrityCloseBtn">&times;</button>
                </div>
                <div class="modal-body" style="max-height:75vh; overflow-y:auto;">
                    <div id="integritySummary" style="font-weight:bold; margin-bottom:12px;"></div>
                    <ul class="history-list" id="integrityIssuesList"></ul>
                </div>
                <div class="modal-footer spread">
                    <button class="btn btn-muted" id="integrityFooterCloseBtn">${T('Close')}</button>
                    <button class="btn btn-success" id="integrityAutoFixBtn" style="display:none;">🛠 Auto-Fix All Issues</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#integrityCloseBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#integrityFooterCloseBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#integrityAutoFixBtn')?.addEventListener('click', () => this.autoFix());
    }

    private static runDiagnostic(): void {
        const summary = document.getElementById('integritySummary');
        const list = document.getElementById('integrityIssuesList');
        const fixBtn = document.getElementById('integrityAutoFixBtn');
        if (!summary || !list || !fixBtn) return;

        const issues: string[] = [];
        const tools = Store.tools;
        const workstations = Store.workstations;

        // Check for tools with missing or unassigned locations
        tools.forEach(t => {
            const ws = Store.workstationOf(t);
            if (!workstations.includes(ws)) {
                issues.push(`Tool ${t.id} references unregistered station: "${ws}"`);
            }
            if (t.assigneeId && !Store.getEmp(t.assigneeId)) {
                issues.push(`Tool ${t.id} assigned to non-existent employee: "${t.assigneeId}"`);
            }
        });

        if (!issues.length) {
            summary.innerHTML = `<span style="color:var(--success);">✔ All relational references, stations, and employee bindings are 100% healthy.</span>`;
            list.innerHTML = `<li class="history-item"><span style="color:var(--text-muted);">No database anomalies detected.</span></li>`;
            fixBtn.style.display = 'none';
        } else {
            summary.innerHTML = `<span style="color:var(--warning);">⚠️ Found ${issues.length} relational anomalies:</span>`;
            list.innerHTML = issues.map(iss => `<li class="history-item"><span style="color:var(--danger); font-size:0.88rem;">${esc(iss)}</span></li>`).join('');
            fixBtn.style.display = 'inline-block';
        }
    }

    private static async autoFix(): Promise<void> {
        const defaultWs = Store.workstations[0] || 'Tool Gage';
        let fixedCount = 0;

        Store.tools.forEach(t => {
            const ws = Store.workstationOf(t);
            if (!Store.workstations.includes(ws)) {
                t.location = defaultWs;
                if (t.address) t.address.zone = defaultWs;
                fixedCount++;
            }
            if (t.assigneeId && !Store.getEmp(t.assigneeId)) {
                t.assigneeId = null;
                t.status = 'Active';
                fixedCount++;
            }
        });

        await Store.save();
        toast(`Fixed ${fixedCount} database anomalies!`, 'success');
        this.runDiagnostic();
    }
}
