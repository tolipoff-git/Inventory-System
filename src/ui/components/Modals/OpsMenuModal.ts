// ============================================================================
// 5S Tool Command Center — OpsMenuModal Component
// ============================================================================

import { T } from '../../../i18n';
import { ScannerModal } from './ScannerModal';
import { AuditModal } from './AuditModal';
import { OrderModal } from './OrderModal';
import { LabelModal } from './LabelModal';
import { CalibrationModal } from './CalibrationModal';
import { exportFullInventoryExcel } from '../../../reports/reportExports';
import { printQueueLabels } from '../../../labels/labelPrint';
import { Store } from '../../../storage/store';
import { hardReloadPwa } from '../../../utils/pwa';

export class OpsMenuModal {
    private static modalId = 'opsMenuModal';

    public static open(): void {
        let modal = document.getElementById(this.modalId);
        if (modal) {
            modal.remove();
        }
        this.createModalDOM();
        modal = document.getElementById(this.modalId);
        if (modal) {
            modal.classList.add('active');
            this.bindEvents(modal);
        }
    }

    public static close(): void {
        const modal = document.getElementById(this.modalId);
        if (modal) {
            modal.classList.remove('active');
        }
    }

    private static bindEvents(modal: HTMLElement): void {
        modal.querySelector('#opsMenuCloseBtn')?.addEventListener('click', () => this.close());

        modal.querySelector('#opsQuickScanBtn')?.addEventListener('click', () => {
            this.close();
            ScannerModal.open();
        });

        modal.querySelector('#ops5sReportBtn')?.addEventListener('click', () => {
            this.close();
            AuditModal.openReport();
        });

        modal.querySelector('#opsExportXlsxBtn')?.addEventListener('click', async () => {
            this.close();
            await exportFullInventoryExcel();
        });

        modal.querySelector('#opsProcureBtn')?.addEventListener('click', () => {
            this.close();
            OrderModal.openProcure();
        });

        modal.querySelector('#opsOrdersBtn')?.addEventListener('click', () => {
            this.close();
            OrderModal.openList();
        });

        modal.querySelector('#opsPostAuditBtn')?.addEventListener('click', () => {
            this.close();
            AuditModal.openPostAudit();
        });

        modal.querySelector('#opsStorageLabelsBtn')?.addEventListener('click', () => {
            this.close();
            LabelModal.openLocationLabels();
        });

        modal.querySelector('#opsCalibrationSessionBtn')?.addEventListener('click', () => {
            this.close();
            CalibrationModal.openSession();
        });

        modal.querySelector('#opsPrintQueueBtn')?.addEventListener('click', async () => {
            this.close();
            await printQueueLabels();
        });

        modal.querySelector('#opsUpdatePwaBtn')?.addEventListener('click', () => {
            hardReloadPwa();
        });
    }

    private static createModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.modalId;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.close();
        });

        const qLen = Store.labelQueue?.length || 0;

        overlay.innerHTML = `
            <div class="modal narrow" style="max-width:440px;">
                <div class="modal-header">
                    <h3 class="modal-title">🎛 <span>${T('Operations & Reports')}</span></h3>
                    <button class="close-btn" id="opsMenuCloseBtn">&times;</button>
                </div>
                <div class="modal-body menu-stack">
                    <button class="btn" id="opsQuickScanBtn">📷 ${T('Quick Scan Barcode')}</button>
                    <button class="btn btn-warning" id="ops5sReportBtn">📋 ${T('Generate 5S Report')}</button>
                    <button class="btn btn-success" id="opsExportXlsxBtn">📊 ${T('Export Full Inventory (.xlsx)')}</button>
                    <button class="btn btn-warning" id="opsProcureBtn">🛒 ${T('Procure / Order Tool')}</button>
                    <button class="btn" id="opsOrdersBtn">📦 ${T('Purchase Orders')}</button>
                    <button class="btn" id="opsPostAuditBtn">📋 ${T('5S Post Audit')}</button>
                    <button class="btn btn-warning" id="opsStorageLabelsBtn">🖨 ${T('Print Storage Labels')}</button>
                    <button class="btn btn-warning" id="opsCalibrationSessionBtn">⚗ ${T('Calibration Session')}</button>
                    <button class="btn btn-secondary" id="opsPrintQueueBtn" style="${qLen > 0 ? '' : 'display:none;'}">🏷 ${T('Print Label Queue')} (${qLen})</button>
                    <button class="btn btn-danger" id="opsUpdatePwaBtn">🔄 ${T('Update PWA')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
    }
}
