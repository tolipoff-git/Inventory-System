// ============================================================================
// 5S Tool Command Center — DetailModal Component
// ============================================================================

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { esc, fmtDate, durationStr, isAutoSn, nowISO } from '../../../utils/formatters';
import { Auth } from '../../../auth/authManager';
import { Photos } from '../../../utils/photos';
import { Tool } from '../../../types/inventory';
import { LabelModal } from './LabelModal';
import { ToolModal } from './ToolModal';

export class DetailModal {
    private static modalId = 'detailModal';
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
            <div class="modal wide" style="max-width:720px;">
                <div class="modal-header">
                    <h3 class="modal-title" id="detTitle">Tool Details</h3>
                    <button class="close-btn" id="detCloseBtn">&times;</button>
                </div>
                <div class="modal-body" style="max-height:75vh; overflow-y:auto;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px; flex-wrap:wrap; gap:10px;">
                        <div>
                            <div style="font-size:1.1rem; font-weight:bold; color:var(--primary-hover);" id="detProgram"></div>
                            <div style="color:var(--text-muted); font-size:0.85rem;" id="detArticle"></div>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button class="btn btn-warning" id="detPrintBtn">🖨 ${T('Print Sticker / Label')}</button>
                            <button class="btn" id="detEditBtn">✏️ ${T('Edit Tool')}</button>
                            <label class="btn" style="cursor:pointer; margin:0;">
                                📷 <span>${T('Add Photo')}</span>
                                <input type="file" accept="image/*" id="detPhotoInput" style="display:none;">
                            </label>
                        </div>
                    </div>

                    <div class="table-scroll" style="margin-bottom:15px;">
                        <table>
                            <tbody>
                                <tr>
                                    <td><strong>${T('Assigned To:')}</strong></td>
                                    <td id="detHolder"></td>
                                    <td><strong>${T('Duration:')}</strong></td>
                                    <td id="detDuration"></td>
                                </tr>
                                <tr>
                                    <td><strong>${T('Serial Number:')}</strong></td>
                                    <td id="detSN" style="font-family:monospace;"></td>
                                    <td><strong>${T('Quantity:')}</strong></td>
                                    <td id="detQty"></td>
                                </tr>
                                <tr>
                                    <td><strong>${T('Calibration Due:')}</strong></td>
                                    <td id="detDue"></td>
                                    <td><strong>${T('Location:')}</strong></td>
                                    <td id="detLocation" style="font-family:monospace;"></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div style="margin-bottom:15px;" id="detLifecycle"></div>

                    <h4 style="margin:15px 0 8px; color:var(--primary-hover);">${T('Transaction History & Photos')}</h4>
                    <ul class="history-list" id="detHistory"></ul>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="detFooterCloseBtn">${T('Close')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#detCloseBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#detFooterCloseBtn')?.addEventListener('click', () => this.close());

        overlay.querySelector('#detPrintBtn')?.addEventListener('click', () => {
            if (this.currentToolId) {
                Auth.doAction('Tool Crib Manager', () => LabelModal.openToolLabel(this.currentToolId!));
            }
        });

        overlay.querySelector('#detEditBtn')?.addEventListener('click', () => {
            if (this.currentToolId) {
                Auth.doAction('Administrator', () => ToolModal.openEdit(this.currentToolId!));
            }
        });

        const photoInput = overlay.querySelector<HTMLInputElement>('#detPhotoInput');
        if (photoInput) {
            photoInput.addEventListener('change', async () => {
                if (photoInput.files && photoInput.files[0] && this.currentToolId) {
                    await Photos.attachPhoto(this.currentToolId, photoInput.files[0]);
                    const tool = Store.getTool(this.currentToolId);
                    if (tool) this.populate(tool);
                }
            });
        }
    }

    private static populate(tool: Tool): void {
        const titleEl = document.getElementById('detTitle');
        if (titleEl) titleEl.textContent = `${tool.id} — ${tool.name}`;

        const emp = tool.assigneeId ? Store.getEmp(tool.assigneeId) : null;
        const holderEl = document.getElementById('detHolder');
        if (holderEl) {
            holderEl.innerHTML = emp
                ? `<span class="person-badge" data-action="emp-profile" data-id="${esc(emp.id)}" style="cursor:pointer;">👤 ${esc(emp.name)}</span>`
                : 'N/A';
        }

        const durEl = document.getElementById('detDuration');
        if (durEl) durEl.textContent = tool.assignedAt ? durationStr(tool.assignedAt) : '—';

        const due = tool.calDue ? fmtDate(tool.calDue) : 'N/A';
        const isOverdue = tool.calDue && tool.calDue < nowISO().split('T')[0];
        const dueEl = document.getElementById('detDue');
        if (dueEl) {
            dueEl.innerHTML = isOverdue ? `<span style="color:var(--danger); font-weight:bold;">${due} (OVERDUE)</span>` : due;
        }

        const snEl = document.getElementById('detSN');
        if (snEl) {
            snEl.textContent = tool.sn ? tool.sn + (isAutoSn(tool.sn) ? ' (auto)' : '') : 'N/A';
        }

        const artEl = document.getElementById('detArticle');
        if (artEl) artEl.textContent = `Article / Part #: ${tool.article || 'N/A'}`;

        const qtyEl = document.getElementById('detQty');
        if (qtyEl) qtyEl.textContent = String(tool.qty || 1);

        const wsp = Store.workstationAndPostOf(tool);
        const progName = tool.program || Store.programOf(wsp.ws);
        const progEl = document.getElementById('detProgram');
        if (progEl) {
            progEl.textContent = [progName, wsp.ws, wsp.post].filter(Boolean).join(' · ') || 'General Tool Crib';
        }

        const locEl = document.getElementById('detLocation');
        if (locEl) {
            const addr = tool.address ? ` [${tool.address.zone || ''} | ${tool.address.rack || ''} ${tool.address.shelf || ''}-${tool.address.bin || ''}]` : '';
            locEl.textContent = `${tool.location || 'N/A'}${addr}`;
        }

        // Action buttons
        const printBtn = document.getElementById('detPrintBtn');
        if (printBtn) {
            printBtn.setAttribute('data-action', 'print-label');
            printBtn.setAttribute('data-id', tool.id);
        }

        const editBtn = document.getElementById('detEditBtn');
        if (editBtn) {
            editBtn.setAttribute('data-action', 'edit-tool');
            editBtn.setAttribute('data-id', tool.id);
            editBtn.style.display = Auth.has('Administrator') ? 'inline-block' : 'none';
        }

        // History & Photos
        const historyEl = document.getElementById('detHistory');
        if (historyEl) {
            const photos = tool.photos || [];
            const history = tool.history || [];

            let html = '';
            if (!history.length && !photos.length) {
                html = '<li class="history-item"><span style="color:var(--text-muted)">No transactions yet.</span></li>';
            } else {
                html += history.map(h => `<li class="history-item"><span>${esc(h)}</span></li>`).join('');
                if (photos.length) {
                    html += `
                        <li class="history-item" style="flex-direction:column; align-items:flex-start;">
                            <strong style="margin-bottom:8px;">📷 Attached Photos (${photos.length}):</strong>
                            <div style="display:flex; flex-wrap:wrap; gap:10px;">
                                ${photos.map((p, idx) => `
                                    <div style="position:relative; width:92px; text-align:center;">
                                        <img src="${esc(p.url || '')}" style="width:92px; height:92px; object-fit:cover; border-radius:6px; cursor:pointer; border:1px solid var(--border);" class="det-photo-thumb" data-url="${esc(p.url || '')}">
                                        <button class="det-photo-del" data-idx="${idx}" style="position:absolute; top:-6px; right:-6px; width:20px; height:20px; border-radius:50%; background:var(--danger); color:#fff; border:none; cursor:pointer; font-size:11px; line-height:1;">✖</button>
                                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${fmtDate(p.ts)}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </li>
                    `;
                }
            }
            historyEl.innerHTML = html;

            historyEl.querySelectorAll('.det-photo-thumb').forEach(img => {
                img.addEventListener('click', (e) => {
                    const url = (e.currentTarget as HTMLElement).dataset.url;
                    if (url) Photos.openViewer(url);
                });
            });

            historyEl.querySelectorAll('.det-photo-del').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const idx = +(e.currentTarget as HTMLElement).dataset.idx!;
                    if (confirm('Delete photo?')) {
                        await Photos.removePhoto(tool.id, idx);
                        const updatedTool = Store.getTool(tool.id);
                        if (updatedTool) this.populate(updatedTool);
                    }
                });
            });
        }

        // 5S Lifecycle
        const lcEl = document.getElementById('detLifecycle');
        if (lcEl) {
            lcEl.innerHTML = `
                <div style="margin-bottom:8px; font-weight:bold; color:var(--success);">
                    Accepted into Service: ${esc(tool.commissioned_date || 'N/A')}
                </div>
            `;
        }
    }
}
