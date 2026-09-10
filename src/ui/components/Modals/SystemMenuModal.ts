// ============================================================================
// 5S Tool Command Center — SystemMenuModal Component
// ============================================================================

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { ToolModal } from './ToolModal';
import { RegistryModal } from './RegistryModal';
import { BatchRotationModal } from './BatchRotationModal';
import { AuditLogModal } from './AuditLogModal';
import { IntegrityModal } from './IntegrityModal';
import { downloadText, toast } from '../../../utils/dom';

export class SystemMenuModal {
    private static modalId = 'systemMenuModal';

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
        modal.querySelector('#sysMenuCloseBtn')?.addEventListener('click', () => this.close());

        modal.querySelector('#sysAddToolBtn')?.addEventListener('click', () => {
            this.close();
            ToolModal.openAdd();
        });

        modal.querySelector('#sysRegistriesBtn')?.addEventListener('click', () => {
            this.close();
            RegistryModal.open();
        });

        modal.querySelector('#sysBatchBtn')?.addEventListener('click', () => {
            this.close();
            BatchRotationModal.open();
        });

        modal.querySelector('#sysArchiveBtn')?.addEventListener('click', () => {
            this.close();
            AuditLogModal.openArchive();
        });

        modal.querySelector('#sysAuditLogBtn')?.addEventListener('click', () => {
            this.close();
            AuditLogModal.openAuditLog();
        });

        modal.querySelector('#sysIntegrityBtn')?.addEventListener('click', () => {
            this.close();
            IntegrityModal.open();
        });

        modal.querySelector('#sysBackupBtn')?.addEventListener('click', () => {
            this.close();
            const data = JSON.stringify(Store.getStateSnapshot(), null, 2);
            downloadText(`Inventory_Backup_${new Date().toISOString().split('T')[0]}.json`, data, 'application/json');
        });

        const restoreInput = modal.querySelector<HTMLInputElement>('#sysRestoreFileInput');
        if (restoreInput) {
            restoreInput.addEventListener('change', async () => {
                this.close();
                if (restoreInput.files && restoreInput.files[0]) {
                    const text = await restoreInput.files[0].text();
                    try {
                        const parsed = JSON.parse(text);
                        Store.applyLoadedData(parsed);
                        await Store.save();
                        toast('Backup successfully restored!', 'success');
                    } catch (e: any) {
                        toast(`Failed to restore backup: ${e.message}`, 'danger');
                    }
                }
            });
        }

        modal.querySelector('#sysUpdateBtn')?.addEventListener('click', () => {
            window.location.reload();
        });
    }

    private static createModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.modalId;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.close();
        });

        overlay.innerHTML = `
            <div class="modal narrow" style="max-width:440px;">
                <div class="modal-header">
                    <h3 class="modal-title">⚙ <span>${T('System Management')}</span></h3>
                    <button class="close-btn" id="sysMenuCloseBtn">&times;</button>
                </div>
                <div class="modal-body menu-stack">
                    <button class="btn" id="sysAddToolBtn">+ ${T('Add New Tool')}</button>
                    <button class="btn" id="sysRegistriesBtn">${T('System Registries')}</button>
                    <button class="btn btn-warning" id="sysBatchBtn">${T('Batch Rotation Operations')}</button>
                    <button class="btn" id="sysArchiveBtn">${T('Decommissioned Assets Archive')}</button>
                    <button class="btn" id="sysAuditLogBtn">${T('System Audit Log')}</button>
                    <button class="btn" id="sysIntegrityBtn">🩺 ${T('Integrity Check')}</button>
                    <button class="btn" id="sysBackupBtn">💾 ${T('Export Backup (.json)')}</button>
                    <label class="btn" style="cursor:pointer; text-align:center; margin:0;">
                        <span>📥 ${T('Restore Backup (.json)')}</span>
                        <input type="file" accept=".json" id="sysRestoreFileInput" style="display:none;">
                    </label>
                    <button class="btn btn-danger" id="sysUpdateBtn">🔄 ${T('Force Update App')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
    }
}
