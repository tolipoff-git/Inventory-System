// ============================================================================
// 5S Tool Command Center — CheckoutModal Component (Assign Tool)
// ============================================================================

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { checkoutTool } from '../../../operations/toolOps';
import { esc } from '../../../utils/formatters';
import { toast } from '../../../utils/dom';

export class CheckoutModal {
    private static modalId = 'assignModal';
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
                    <h3 class="modal-title" id="assignTitle">${T('Assign Tool')}</h3>
                    <button class="close-btn" id="assignCloseBtn">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="font-size:0.95rem; margin-bottom:12px;" id="assignToolInfo"></div>

                    <div class="form-group">
                        <label>${T('Assign to Employee:')} *</label>
                        <select id="assignEmployeeSelect" class="form-control"></select>
                    </div>

                    <div class="form-group">
                        <label>${T('Expected Return Date:')}</label>
                        <input type="date" id="assignReturnDate" class="form-control">
                    </div>

                    <div class="form-group">
                        <label>${T('Transfer to Workstation (Optional):')}</label>
                        <select id="assignWsSelect" class="form-control"></select>
                    </div>

                    <div class="form-group">
                        <label>${T('Notes / Assignment Purpose:')}</label>
                        <input type="text" id="assignNotes" class="form-control" placeholder="e.g. Engine assembly line 2">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="assignCancelBtn">${T('Cancel')}</button>
                    <button class="btn btn-success" id="assignSubmitBtn">${T('Confirm Assignment')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#assignCloseBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#assignCancelBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#assignSubmitBtn')?.addEventListener('click', () => this.submit());
    }

    private static populate(tool: any): void {
        const titleEl = document.getElementById('assignTitle');
        const infoEl = document.getElementById('assignToolInfo');
        const empSelect = document.getElementById('assignEmployeeSelect') as HTMLSelectElement;
        const wsSelect = document.getElementById('assignWsSelect') as HTMLSelectElement;

        if (titleEl) titleEl.textContent = `${T('Assign Tool')} — ${tool.id}`;
        if (infoEl) infoEl.innerHTML = `<strong>${esc(tool.name)}</strong> (${esc(tool.category)})`;

        if (empSelect) {
            empSelect.innerHTML = Store.activePersonnel().map(p =>
                `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.initials || p.id)})</option>`
            ).join('');
        }

        if (wsSelect) {
            wsSelect.innerHTML = `<option value="">-- Keep Current Location --</option>` +
                Store.workstations.map(ws => `<option value="${esc(ws)}">${esc(ws)}</option>`).join('');
        }

        (document.getElementById('assignReturnDate') as HTMLInputElement).value = '';
        (document.getElementById('assignNotes') as HTMLInputElement).value = '';
    }

    private static async submit(): Promise<void> {
        if (!this.currentToolId) return;
        const empId = (document.getElementById('assignEmployeeSelect') as HTMLSelectElement).value;
        const returnDate = (document.getElementById('assignReturnDate') as HTMLInputElement).value;
        const ws = (document.getElementById('assignWsSelect') as HTMLSelectElement).value;
        const notes = (document.getElementById('assignNotes') as HTMLInputElement).value.trim();

        if (!empId) {
            toast('Please select an employee.', 'warning');
            return;
        }

        try {
            const res = await checkoutTool(this.currentToolId, empId, returnDate || 1, 1, 'OP', ws || 'Tool Gage', '', notes || '');
            if (!res.success) {
                toast(res.error || 'Checkout failed', 'danger');
                return;
            }
            if (ws) {
                const tool = Store.getTool(this.currentToolId);
                if (tool) {
                    tool.location = ws;
                    if (tool.address) tool.address.zone = ws;
                    await Store.saveTool(tool);
                }
            }
            toast(`Tool successfully assigned to ${Store.empName(empId)}!`, 'success');
            this.close();
        } catch (e: any) {
            toast(`Checkout failed: ${e.message}`, 'danger');
        }
    }
}
