// ============================================================================
// 5S Tool Command Center — IntegrityModal Component (Database Self-Diagnostic)
//
// Reports dangling references and offers the *correct* repair for each kind:
//
//   • "tool references an unregistered station" → register the station
//     (`Store.importRegistryFromData()`), which is non-destructive. The old
//     "auto-fix" used to relocate such tools to the first registered station,
//     silently destroying their real location — that is now a separate,
//     explicitly-labelled action behind a confirmation.
//   • "tool assigned to a non-existent employee" → clear the assignment.
// ============================================================================

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { esc } from '../../../utils/formatters';
import { toast } from '../../../utils/dom';
import { windowConfirm } from '../../../utils/dialogCompat';

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
            <div class="modal" style="max-width:640px;">
                <div class="modal-header">
                    <h3 class="modal-title">🩺 ${T('Integrity Check')}</h3>
                    <button class="close-btn" id="integrityCloseBtn">&times;</button>
                </div>
                <div class="modal-body" style="max-height:75vh; overflow-y:auto;">
                    <div id="integritySummary" style="font-weight:bold; margin-bottom:12px;"></div>
                    <ul class="history-list" id="integrityIssuesList"></ul>
                    <div id="integrityImportBlock" style="display:none; margin-top:14px; padding:10px 12px; border:1px solid var(--border); border-left:3px solid var(--primary); border-radius:4px;">
                        <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:8px;">${T('REGISTRY_IMPORT_HINT')}</div>
                        <button class="btn btn-success" id="integrityImportBtn">${T('REGISTRY_IMPORT')}</button>
                    </div>
                </div>
                <div class="modal-footer spread">
                    <button class="btn btn-muted" id="integrityFooterCloseBtn">${T('Close')}</button>
                    <button class="btn btn-warning" id="integrityMoveBtn" style="display:none;">${T('INTEGRITY_MOVE_TO_DEFAULT')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#integrityCloseBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#integrityFooterCloseBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#integrityImportBtn')?.addEventListener('click', () => this.importRegistry());
        overlay.querySelector('#integrityMoveBtn')?.addEventListener('click', () => this.moveToDefaultStation());
    }

    /** Stations referenced by tools or personnel that are not in the registry. */
    private static unregisteredStations(): string[] {
        return Store.pendingRegistryImport().stationNames;
    }

    private static runDiagnostic(): void {
        const summary = document.getElementById('integritySummary');
        const list = document.getElementById('integrityIssuesList');
        const importBlock = document.getElementById('integrityImportBlock');
        const moveBtn = document.getElementById('integrityMoveBtn');
        if (!summary || !list || !importBlock || !moveBtn) return;

        const issues: string[] = [];
        const unregistered = this.unregisteredStations();

        if (unregistered.length) {
            issues.push(T('INTEGRITY_UNREGISTERED').replace('{n}', String(unregistered.length))
                + ' ' + unregistered.map(esc).join(', '));
        }

        Store.tools.forEach(t => {
            if (t.assigneeId && !Store.getEmp(t.assigneeId)) {
                issues.push(`Tool ${t.id} assigned to non-existent employee: "${t.assigneeId}"`);
            }
        });

        if (!issues.length) {
            summary.innerHTML = `<span style="color:var(--success);">${T('INTEGRITY_OK')}</span>`;
            list.innerHTML = `<li class="history-item"><span style="color:var(--text-muted);">${T('INTEGRITY_NO_ANOMALIES')}</span></li>`;
            importBlock.style.display = 'none';
            moveBtn.style.display = 'none';
            return;
        }

        summary.innerHTML = `<span style="color:var(--warning);">${T('INTEGRITY_FOUND').replace('{n}', String(issues.length))}</span>`;
        list.innerHTML = issues
            .map(iss => `<li class="history-item"><span style="color:var(--danger); font-size:0.88rem;">${esc(iss)}</span></li>`)
            .join('');

        // Registering the missing stations is the correct repair; relocating the
        // tools is destructive, so it stays a separate, explicit choice.
        importBlock.style.display = unregistered.length ? 'block' : 'none';
        moveBtn.style.display = unregistered.length ? 'inline-block' : 'none';
    }

    private static async importRegistry(): Promise<void> {
        const res = Store.importRegistryFromData();

        if (res.stations || res.posts || res.programs || res.links) {
            toast(T('REGISTRY_IMPORT_DONE')
                .replace('{stations}', String(res.stations))
                .replace('{posts}', String(res.posts))
                .replace('{programs}', String(res.programs))
                .replace('{links}', String(res.links)), 'success');
        } else {
            toast(T('REGISTRY_IMPORT_NONE'), 'warning');
        }

        if (res.skipped.length) {
            toast(T('REGISTRY_IMPORT_SKIPPED').replace('{list}', res.skipped.slice(0, 6).join(', ')), 'warning');
        }

        this.runDiagnostic();
    }

    private static async moveToDefaultStation(): Promise<void> {
        const defaultWs = Store.workstations[0] || 'Tool Gage';
        if (!windowConfirm(T('INTEGRITY_MOVE_CONFIRM').replace('{ws}', defaultWs))) return;

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
        toast(T('INTEGRITY_FIXED').replace('{n}', String(fixedCount)), 'success');
        this.runDiagnostic();
    }
}