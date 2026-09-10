// ============================================================================
// 5S Tool Command Center — ReturnModal Component (Return Tool)
// ============================================================================

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { returnTool } from '../../../operations/toolOps';
import { esc } from '../../../utils/formatters';
import { toast } from '../../../utils/dom';

export class ReturnModal {
    private static modalId = 'returnModal';
    private static currentToolId: string | null = null;

    public static open(toolId: string): void {
        this.currentToolId = toolId;
        const tool = Store.getTool(toolId);
        if (!tool) return;

        let modal = document.getElementById(this.modalId);
        if (!modal) {
            this.createModalDOM();
            modal = document.getElementById(this.modalId);
        }

        this.populate(tool);
        if (modal) modal.classList.add('active');
    }

    public static close(): void {
        const modal = document.getElementById(this.modalId);
        if (modal) modal.classList.remove('active');
        this.currentToolId = null;
    }

    private static createModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.modalId;

        overlay.innerHTML = `
            <div class="modal narrow" style="max-width:480px;">
                <div class="modal-header">
                    <h3 class="modal-title" id="returnTitle">${T('Return Tool')}</h3>
                    <button class="close-btn" id="returnCloseBtn">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="font-size:0.95rem; margin-bottom:12px;" id="returnToolInfo"></div>

                    <div class="form-group">
                        <label>${T('Condition Score (1-5):')}</label>
                        <select id="returnConditionScore" class="form-control">
                            <option value="5">⭐⭐⭐⭐⭐ 5 — Excellent / Clean</option>
                            <option value="4" selected>⭐⭐⭐⭐ 4 — Good / Normal Wear</option>
                            <option value="3">⭐⭐⭐ 3 — Fair / Needs Cleaning</option>
                            <option value="2">⭐⭐ 2 — Poor / Needs Maintenance</option>
                            <option value="1">⭐ 1 — Broken / Scrap</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>${T('Return Location:')}</label>
                        <select id="returnLocationSelect" class="form-control"></select>
                    </div>

                    <div class="form-group">
                        <label>${T('Return Inspection Notes:')}</label>
                        <input type="text" id="returnNotes" class="form-control" placeholder="e.g. Cleaned and returned to shadow board">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="returnCancelBtn">${T('Cancel')}</button>
                    <button class="btn btn-success" id="returnSubmitBtn">${T('Process Return')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#returnCloseBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#returnCancelBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#returnSubmitBtn')?.addEventListener('click', () => this.submit());
    }

    private static populate(tool: any): void {
        const titleEl = document.getElementById('returnTitle');
        const infoEl = document.getElementById('returnToolInfo');
        const locSelect = document.getElementById('returnLocationSelect') as HTMLSelectElement;

        if (titleEl) titleEl.textContent = `${T('Return Tool')} — ${tool.id}`;
        if (infoEl) {
            const holder = tool.assigneeId ? Store.empName(tool.assigneeId) : 'N/A';
            infoEl.innerHTML = `<strong>${esc(tool.name)}</strong><br><span style="color:var(--text-muted);">${T('Currently held by:')} ${esc(holder)}</span>`;
        }

        if (locSelect) {
            locSelect.innerHTML = Store.workstations.map(ws =>
                `<option value="${esc(ws)}" ${tool.location?.startsWith(ws) ? 'selected' : ''}>${esc(ws)}</option>`
            ).join('');
        }

        (document.getElementById('returnConditionScore') as HTMLSelectElement).value = '4';
        (document.getElementById('returnNotes') as HTMLInputElement).value = '';
    }

    private static async submit(): Promise<void> {
        if (!this.currentToolId) return;
        const score = parseInt((document.getElementById('returnConditionScore') as HTMLSelectElement).value) || 4;
        const loc = (document.getElementById('returnLocationSelect') as HTMLSelectElement).value;
        const notes = (document.getElementById('returnNotes') as HTMLInputElement).value.trim();

        try {
            await returnTool(this.currentToolId, score, notes || 'OP', loc || undefined);
            toast(`Tool ${this.currentToolId} returned to inventory!`, 'success');
            this.close();
        } catch (e: any) {
            toast(`Return failed: ${e.message}`, 'danger');
        }
    }
}
