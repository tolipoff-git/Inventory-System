// ============================================================================
// 5S Tool Command Center — BatchRotationModal Component
// ============================================================================

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { esc } from '../../../utils/formatters';
import { toast } from '../../../utils/dom';
import { windowConfirm } from '../../../utils/dialogCompat';

export class BatchRotationModal {
    private static modalId = 'batchRotationModal';

    public static open(): void {
        let modal = document.getElementById(this.modalId);
        if (!modal) {
            this.createModalDOM();
            modal = document.getElementById(this.modalId);
        }

        this.populateDropdowns();
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
            <div class="modal" style="max-width:520px;">
                <div class="modal-header">
                    <h3 class="modal-title">⇄ ${T('Batch Rotation Operations')}</h3>
                    <button class="close-btn" id="batchCloseBtn">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="font-size:0.88rem; color:var(--text-muted); margin-bottom:14px;">
                        Rotate or transfer an entire kit of tooling from one workstation to another for shift handovers or line rebalancing.
                    </p>

                    <div class="form-group">
                        <label>${T('Source Workstation:')}</label>
                        <select id="batchSourceWs" class="form-control"></select>
                    </div>

                    <div class="form-group">
                        <label>${T('Destination Workstation:')}</label>
                        <select id="batchTargetWs" class="form-control"></select>
                    </div>

                    <div id="batchPreviewCount" style="margin-top:12px; font-weight:bold; color:var(--primary-hover);"></div>
                </div>
                <div class="modal-footer spread">
                    <button class="btn btn-muted" id="batchCancelBtn">${T('Cancel')}</button>
                    <button class="btn btn-warning" id="batchExecuteBtn">${T('Rotate All Tools')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#batchCloseBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#batchCancelBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#batchExecuteBtn')?.addEventListener('click', () => this.executeRotation());

        const srcSelect = overlay.querySelector<HTMLSelectElement>('#batchSourceWs');
        if (srcSelect) {
            srcSelect.addEventListener('change', () => this.updatePreview());
        }
    }

    private static populateDropdowns(): void {
        const srcSelect = document.getElementById('batchSourceWs') as HTMLSelectElement;
        const tgtSelect = document.getElementById('batchTargetWs') as HTMLSelectElement;

        const options = Store.workstations.map(ws => `<option value="${esc(ws)}">${esc(ws)}</option>`).join('');
        if (srcSelect) srcSelect.innerHTML = options;
        if (tgtSelect) tgtSelect.innerHTML = options;

        this.updatePreview();
    }

    private static updatePreview(): void {
        const src = (document.getElementById('batchSourceWs') as HTMLSelectElement)?.value;
        const preview = document.getElementById('batchPreviewCount');
        if (!preview || !src) return;

        const count = Store.activeTools().filter(t => Store.workstationOf(t) === src).length;
        preview.textContent = `Found ${count} tools currently allocated to ${src}.`;
    }

    private static async executeRotation(): Promise<void> {
        const src = (document.getElementById('batchSourceWs') as HTMLSelectElement).value;
        const tgt = (document.getElementById('batchTargetWs') as HTMLSelectElement).value;

        if (src === tgt) {
            toast('Source and Destination workstations must be different.', 'warning');
            return;
        }

        const toolsToRotate = Store.activeTools().filter(t => Store.workstationOf(t) === src);
        if (!toolsToRotate.length) {
            toast(`No active tools found at ${src}.`, 'warning');
            return;
        }

        if (windowConfirm(`Rotate ${toolsToRotate.length} tools from ${src} to ${tgt}?`)) {
            toolsToRotate.forEach(t => {
                t.location = tgt;
                if (t.address) t.address.zone = tgt;
                if (!t.history) t.history = [];
                t.history.push(`${new Date().toISOString().split('T')[0]} | Batch rotated from ${src} to ${tgt}`);
            });

            await Store.save();
            toast(`Successfully rotated ${toolsToRotate.length} tools to ${tgt}!`, 'success');
            this.close();
        }
    }
}
