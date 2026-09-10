// ============================================================================
// 5S Tool Command Center — ServiceModal Component (Maintenance & Calibration)
// ============================================================================

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { serviceTool, completeMaintenance } from '../../../operations/toolOps';
import { esc } from '../../../utils/formatters';
import { toast } from '../../../utils/dom';

export class ServiceModal {
    private static modalId = 'serviceModal';
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
                    <h3 class="modal-title" id="serviceTitle">${T('Service / Calibrate')}</h3>
                    <button class="close-btn" id="serviceCloseBtn">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="font-size:0.95rem; margin-bottom:12px;" id="serviceToolInfo"></div>

                    <div id="serviceQueueSection">
                        <div class="form-group">
                            <label>${T('Service Type / Action:')}</label>
                            <select id="serviceTypeSelect" class="form-control">
                                <option value="Calibration">⚗ Calibration & Verification</option>
                                <option value="Repair">🔧 Mechanical / Electrical Repair</option>
                                <option value="Sharpening">🔪 Tool Sharpening / Regrinding</option>
                                <option value="Inspection">🔍 Routine 5S Inspection</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>${T('Reason / Defect Description:')}</label>
                            <input type="text" id="serviceReasonInput" class="form-control" placeholder="e.g. Torque out of tolerance">
                        </div>

                        <button class="btn btn-warning wide" id="serviceQueueSubmitBtn" style="margin-top:10px;">
                            ${T('Send to Service Queue')}
                        </button>
                    </div>

                    <div id="serviceCompleteSection" style="display:none; margin-top:15px; padding-top:15px; border-top:1px solid var(--border);">
                        <h4 style="margin-top:0; color:var(--success);">${T('Complete Maintenance')}</h4>
                        <div class="form-group">
                            <label>${T('Next Calibration Date (Optional):')}</label>
                            <input type="date" id="serviceNextCalDue" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>${T('Work Done / Maintenance Notes:')}</label>
                            <input type="text" id="serviceCompleteNotes" class="form-control" placeholder="e.g. Cleaned, oiled, calibrated to ±2%">
                        </div>
                        <button class="btn btn-success wide" id="serviceCompleteSubmitBtn">
                            ${T('Mark as Maintenance Completed')}
                        </button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="serviceCancelBtn">${T('Close')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#serviceCloseBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#serviceCancelBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#serviceQueueSubmitBtn')?.addEventListener('click', () => this.submitServiceQueue());
        overlay.querySelector('#serviceCompleteSubmitBtn')?.addEventListener('click', () => this.submitCompleteMaint());
    }

    private static populate(tool: any): void {
        const titleEl = document.getElementById('serviceTitle');
        const infoEl = document.getElementById('serviceToolInfo');
        const completeSection = document.getElementById('serviceCompleteSection');

        if (titleEl) titleEl.textContent = `${T('Service / Calibrate')} — ${tool.id}`;
        if (infoEl) {
            infoEl.innerHTML = `<strong>${esc(tool.name)}</strong><br><span style="color:var(--text-muted);">${T('Status:')} ${esc(tool.status)}</span>`;
        }

        if (completeSection) {
            completeSection.style.display = tool.status === 'Maintenance' ? 'block' : 'none';
        }

        (document.getElementById('serviceReasonInput') as HTMLInputElement).value = '';
        (document.getElementById('serviceCompleteNotes') as HTMLInputElement).value = '';
    }

    private static async submitServiceQueue(): Promise<void> {
        if (!this.currentToolId) return;
        const type = (document.getElementById('serviceTypeSelect') as HTMLSelectElement).value;
        const reason = (document.getElementById('serviceReasonInput') as HTMLInputElement).value.trim() || type;

        try {
            await serviceTool(this.currentToolId, reason, type);
            toast(`Tool ${this.currentToolId} queued for ${type}!`, 'warning');
            this.close();
        } catch (e: any) {
            toast(`Failed: ${e.message}`, 'danger');
        }
    }

    private static async submitCompleteMaint(): Promise<void> {
        if (!this.currentToolId) return;
        const nextCal = (document.getElementById('serviceNextCalDue') as HTMLInputElement).value;
        const notes = (document.getElementById('serviceCompleteNotes') as HTMLInputElement).value.trim();

        try {
            await completeMaintenance(this.currentToolId, notes || 'Tech', nextCal || undefined);
            toast(`Tool ${this.currentToolId} returned to Active service!`, 'success');
            this.close();
        } catch (e: any) {
            toast(`Failed: ${e.message}`, 'danger');
        }
    }
}
