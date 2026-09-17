// ============================================================================
// 5S Tool Command Center — RetireModal Component (Decommission / Scrap)
// ============================================================================

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { decommissionTool } from '../../../operations/toolOps';
import { esc } from '../../../utils/formatters';
import { toast } from '../../../utils/dom';
import { windowConfirm } from '../../../utils/dialogCompat';

export class RetireModal {
    private static modalId = 'retireModal';
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
            <div class="modal narrow" style="max-width:460px;">
                <div class="modal-header">
                    <h3 class="modal-title" id="retireTitle" style="color:var(--danger);">${T('Decommission / Retire Tool')}</h3>
                    <button class="close-btn" id="retireCloseBtn">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="font-size:0.95rem; margin-bottom:12px;" id="retireToolInfo"></div>

                    <div class="form-group">
                        <label>${T('Retirement Reason:')}</label>
                        <select id="retireReasonSelect" class="form-control">
                            <option value="Broken / Scrap" data-i18n="Broken / Beyond Economic Repair">${T('Broken / Beyond Economic Repair')}</option>
                            <option value="Worn Out" data-i18n="Excessive Wear (>80%)">${T('Excessive Wear (>80%)')}</option>
                            <option value="Obsolete" data-i18n="Technically Obsolete / Upgraded">${T('Technically Obsolete / Upgraded')}</option>
                            <option value="Lost / Missing" data-i18n="Lost / Unaccounted Asset">${T('Lost / Unaccounted Asset')}</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>${T('Decommission Notes / Disposal Method:')}</label>
                        <input type="text" id="retireNotesInput" class="form-control" placeholder="${T('RETIRE_NOTES_PH')}" data-i18n-ph="RETIRE_NOTES_PH">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="retireCancelBtn" data-i18n="Cancel">${T('Cancel')}</button>
                    <button class="btn btn-danger" id="retireSubmitBtn" data-i18n="Retire Asset">${T('Retire Asset')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#retireCloseBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#retireCancelBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#retireSubmitBtn')?.addEventListener('click', () => this.submit());
    }

    private static populate(tool: any): void {
        const titleEl = document.getElementById('retireTitle');
        const infoEl = document.getElementById('retireToolInfo');

        if (titleEl) titleEl.textContent = `${T('Decommission / Retire Tool')} — ${tool.id}`;
        if (infoEl) {
            infoEl.innerHTML = `<strong>${esc(tool.name)}</strong> (${esc(tool.spec || 'N/A')})<br><span style="color:var(--text-muted);">${T('Location:')} ${esc(tool.location || 'N/A')}</span>`;
        }

        (document.getElementById('retireNotesInput') as HTMLInputElement).value = '';
    }

    private static async submit(): Promise<void> {
        if (!this.currentToolId) return;
        const reason = (document.getElementById('retireReasonSelect') as HTMLSelectElement).value;
        const notes = (document.getElementById('retireNotesInput') as HTMLInputElement).value.trim();

        if (windowConfirm(T('RETIRE_CONFIRM').replace('{id}', this.currentToolId))) {
            try {
                await decommissionTool(this.currentToolId, 100, reason, 'Admin', notes || '');
                toast(T('RETIRE_SUCCESS').replace('{id}', this.currentToolId), 'warning');
                this.close();
            } catch (e: any) {
                toast(T('RETIRE_FAILED').replace('{msg}', e.message), 'danger');
            }
        }
    }
}
