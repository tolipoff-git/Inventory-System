// ============================================================================
// 5S Tool Command Center — AuditLogModal Component (Audit Logs & Archive)
// ============================================================================

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { esc, fmtDate } from '../../../utils/formatters';
import { toast, downloadText } from '../../../utils/dom';

export class AuditLogModal {
    private static auditModalId = 'auditLogModal';
    private static archiveModalId = 'archiveModal';

    // Open System Audit Log
    public static openAuditLog(): void {
        let modal = document.getElementById(this.auditModalId);
        if (!modal) {
            this.createAuditLogModalDOM();
            modal = document.getElementById(this.auditModalId);
        }
        this.renderAuditLog();
        if (modal) modal.classList.add('active');
    }

    public static closeAuditLog(): void {
        const modal = document.getElementById(this.auditModalId);
        if (modal) modal.classList.remove('active');
    }

    // Open Decommissioned Assets Archive
    public static openArchive(): void {
        let modal = document.getElementById(this.archiveModalId);
        if (!modal) {
            this.createArchiveModalDOM();
            modal = document.getElementById(this.archiveModalId);
        }
        this.renderArchive();
        if (modal) modal.classList.add('active');
    }

    public static closeArchive(): void {
        const modal = document.getElementById(this.archiveModalId);
        if (modal) modal.classList.remove('active');
    }

    private static createAuditLogModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.auditModalId;

        overlay.innerHTML = `
            <div class="modal wide" style="max-width:920px;">
                <div class="modal-header">
                    <h3 class="modal-title">📋 ${T('System Audit Log')}</h3>
                    <button class="close-btn" id="auditLogCloseBtn">&times;</button>
                </div>
                <div class="modal-body" style="max-height:75vh; overflow-y:auto;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px; gap:10px; flex-wrap:wrap;">
                        <input type="text" id="auditLogSearch" class="form-control" placeholder="Search log entries…" style="max-width:300px;">
                        <button class="btn btn-success" id="exportAuditLogCsvBtn">📊 ${T('Export (.csv)')}</button>
                    </div>
                    <div class="table-scroll">
                        <table>
                            <thead>
                                <tr>
                                    <th>Timestamp</th>
                                    <th>User</th>
                                    <th>Action</th>
                                    <th>Details</th>
                                </tr>
                            </thead>
                            <tbody id="auditLogTableBody"></tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="auditLogFooterCloseBtn">${T('Close')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#auditLogCloseBtn')?.addEventListener('click', () => this.closeAuditLog());
        overlay.querySelector('#auditLogFooterCloseBtn')?.addEventListener('click', () => this.closeAuditLog());
        overlay.querySelector('#exportAuditLogCsvBtn')?.addEventListener('click', () => this.exportCsv());

        const searchInput = overlay.querySelector<HTMLInputElement>('#auditLogSearch');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.renderAuditLog(searchInput.value.trim().toLowerCase());
            });
        }
    }

    private static renderAuditLog(query: string = ''): void {
        const tbody = document.getElementById('auditLogTableBody');
        if (!tbody) return;

        let logs = Store.auditLog || [];
        if (query) {
            logs = logs.filter(l =>
                (l.action || '').toLowerCase().includes(query) ||
                (l.details || '').toLowerCase().includes(query) ||
                (l.user || '').toLowerCase().includes(query)
            );
        }

        if (!logs.length) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">No log records.</td></tr>`;
            return;
        }

        tbody.innerHTML = logs.slice(0, 200).map(l => `
            <tr>
                <td style="white-space:nowrap; font-size:0.8rem; color:var(--text-muted);">${fmtDate(l.ts)}</td>
                <td><strong>${esc(l.user)}</strong></td>
                <td><span style="font-weight:bold; color:var(--primary-hover);">${esc(l.action)}</span></td>
                <td>${esc(l.details)}</td>
            </tr>
        `).join('');
    }

    private static exportCsv(): void {
        const logs = Store.auditLog || [];
        const csv = ['Timestamp,User,Action,Details']
            .concat(logs.map(l => `"${l.ts}","${(l.user || '').replace(/"/g, '""')}","${(l.action || '').replace(/"/g, '""')}","${(l.details || '').replace(/"/g, '""')}"`))
            .join('\n');
        downloadText(`Inventory_Audit_Log_${new Date().toISOString().split('T')[0]}.csv`, csv, 'text/csv');
    }

    private static createArchiveModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.archiveModalId;

        overlay.innerHTML = `
            <div class="modal wide" style="max-width:880px;">
                <div class="modal-header">
                    <h3 class="modal-title">🗑 ${T('Retired / Decommissioned Assets Archive')}</h3>
                    <button class="close-btn" id="archiveCloseBtn">&times;</button>
                </div>
                <div class="modal-body" style="max-height:75vh; overflow-y:auto;">
                    <div class="table-scroll">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>${T('Name')}</th>
                                    <th>${T('Category')}</th>
                                    <th>${T('Last Location')}</th>
                                    <th>${T('Actions')}</th>
                                </tr>
                            </thead>
                            <tbody id="archiveTableBody"></tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="archiveFooterCloseBtn">${T('Close')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#archiveCloseBtn')?.addEventListener('click', () => this.closeArchive());
        overlay.querySelector('#archiveFooterCloseBtn')?.addEventListener('click', () => this.closeArchive());
    }

    private static renderArchive(): void {
        const tbody = document.getElementById('archiveTableBody');
        if (!tbody) return;

        const retired = Store.retiredTools();
        if (!retired.length) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">Archive is empty.</td></tr>`;
            return;
        }

        tbody.innerHTML = retired.map(t => `
            <tr>
                <td><strong>${esc(t.id)}</strong></td>
                <td>${esc(t.name)}</td>
                <td>${esc(t.category)}</td>
                <td>${esc(t.location || 'N/A')}</td>
                <td>
                    <button class="btn btn-success" style="padding:3px 8px; font-size:0.8rem;" data-archive-restore="${esc(t.id)}">
                        ↩ ${T('Restore Tool')}
                    </button>
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('[data-archive-restore]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = (e.currentTarget as HTMLElement).dataset.archiveRestore!;
                const tool = Store.getTool(id);
                if (tool) {
                    tool.status = 'Active';
                    if (!tool.history) tool.history = [];
                    tool.history.push(`${new Date().toISOString().split('T')[0]} | Restored from Retired Archive to Active`);
                    await Store.saveTool(tool);
                    toast(`Tool ${id} restored to Active service!`, 'success');
                    this.renderArchive();
                }
            });
        });
    }
}
