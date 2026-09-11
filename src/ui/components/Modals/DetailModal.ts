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
import { generateQrDataUrl, toolDeeplink } from '../../../labels/qrGenerator';
import { printHtml, toast } from '../../../utils/dom';

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
        const qBtn = document.getElementById('detQueueBtn');
        if (qBtn) {
            const inQueue = Store.isInLabelQueue(toolId);
            qBtn.innerText = inQueue ? '✓ In Queue' : `+ 🏷 ${T('Add to Queue')}`;
            qBtn.className = inQueue ? 'btn btn-warning' : 'btn';
        }
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
                            <button class="btn btn-secondary" id="detPassportBtn">📄 ${T('Tool Passport')}</button>
                            <button class="btn" id="detQueueBtn">+ 🏷 ${T('Add to Queue')}</button>
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

        overlay.querySelector('#detPassportBtn')?.addEventListener('click', () => {
            if (this.currentToolId) {
                this.printPassport(this.currentToolId);
            }
        });

        overlay.querySelector('#detQueueBtn')?.addEventListener('click', () => {
            if (this.currentToolId) {
                Store.toggleLabelQueue(this.currentToolId);
                const inQueue = Store.isInLabelQueue(this.currentToolId);
                const btn = document.getElementById('detQueueBtn');
                if (btn) {
                    btn.innerText = inQueue ? '✓ In Queue' : `+ 🏷 ${T('Add to Queue')}`;
                    btn.className = inQueue ? 'btn btn-warning' : 'btn';
                }
                toast(inQueue ? `Added ${this.currentToolId} to print queue.` : `Removed ${this.currentToolId} from queue.`, 'info');
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

    public static async printPassport(toolId: string): Promise<void> {
        const tool = Store.getTool(toolId);
        if (!tool) return;

        let qrDataUrl = '';
        try {
            qrDataUrl = await generateQrDataUrl(toolDeeplink(tool.id));
        } catch {
            qrDataUrl = '';
        }

        const historyEntries = (tool.history || []).map((h: string) => {
            const [ts = '', ...rest] = h.split(' | ');
            const event = rest.join(' | ');
            return `<tr><td style="padding:6px 8px; border-bottom:1px solid #e2e8f0;"><strong>${esc(ts)}</strong></td><td style="padding:6px 8px; border-bottom:1px solid #e2e8f0;">${esc(event || h)}</td></tr>`;
        }).join('') || '<tr><td colspan="2" style="padding:8px; color:var(--text-muted);">No audit trail records.</td></tr>';

        const auditEntries = (tool.audit_history || []).map((a: any) => {
            return `<tr><td style="padding:6px 8px; border-bottom:1px solid #e2e8f0;">${esc(fmtDate(a.date || ''))}</td><td style="padding:6px 8px; border-bottom:1px solid #e2e8f0;">${esc(a.inspector || 'N/A')}</td><td style="padding:6px 8px; border-bottom:1px solid #e2e8f0;">${esc(String(a.result || 'N/A'))}</td><td style="padding:6px 8px; border-bottom:1px solid #e2e8f0;">${esc(String(a.wear_pct || ''))}%</td><td style="padding:6px 8px; border-bottom:1px solid #e2e8f0;">${esc(a.notes || '—')}</td></tr>`;
        }).join('') || '<tr><td colspan="5" style="padding:8px; color:var(--text-muted);">No calibration / wear assessment records.</td></tr>';

        const assignee = tool.assigneeId ? Store.getEmp(tool.assigneeId) : null;
        const assigneeName = assignee ? assignee.name : (tool.assigneeId ? 'Unknown' : 'Unassigned');

        const passportHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>TOOL PASSPORT — ${esc(tool.id)}</title>
<style>
@media print { @page { size: A4 portrait; margin: 12mm; } body { font-size: 9pt; } }
body { font-family: "Segoe UI", system-ui, sans-serif; color: #1e293b; background: #fff; max-width: 210mm; margin: 0 auto; padding: 24px 16px; line-height: 1.35; }
h1 { font-size: 16pt; letter-spacing: 0.8pt; text-transform: uppercase; color: #0f172a; border-bottom: 3px solid #0f172a; padding-bottom: 8px; margin-bottom: 4px; }
h2 { font-size: 11pt; color: #334155; border-left: 4px solid #00d2ff; padding-left: 10px; margin: 16px 0 8px; text-transform: uppercase; letter-spacing: 0.4pt; }
h3 { font-size: 10pt; color: #0f172a; margin: 12px 0 6px; }
.header-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 12px; }
.header-row .company { font-size: 10pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.5pt; }
.header-row .doc-id { font-size: 9pt; color: #64748b; }
.qr-block { text-align: center; min-width: 110px; }
.qr-block img { width: 96px; height: 96px; border: 1px solid #cbd5e1; border-radius: 6px; }
.spec-table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 6px; }
.spec-table th { background: #1e293b; color: #fff; text-align: left; padding: 6px 8px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.3pt; }
.spec-table td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
.spec-table tr:nth-child(even) { background: #f8fafc; }
.audit-table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-top: 6px; }
.audit-table th { background: #f1f5f9; color: #334155; text-align: left; padding: 5px 6px; border-bottom: 2px solid #cbd5e1; }
.audit-table td { padding: 5px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.sign-off { display: flex; gap: 48px; margin-top: 20px; padding-top: 12px; border-top: 2px dashed #94a3b8; font-size: 9pt; }
.sign-box { min-width: 220px; }
.sign-box .label { display: block; color: #64748b; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.3pt; }
.sign-box .line { border-bottom: 1px solid #334155; height: 22px; margin-top: 4px; }
.stamp { font-family: monospace; color: #94a3b8; font-size: 7pt; margin-top: 4px; }
</style>
</head>
<body>

<div class="header-row">
  <div>
    <div class="company">5S Tool Command Center</div>
    <h1>TOOL PASSPORT &amp; TECHNICAL SPECIFICATION</h1>
    <div style="font-size: 11pt; color: #334155; font-weight: bold; margin-top: 4px;">ISO 9001 / 5S — QUALITY &amp; TRACEABILITY RECORD</div>
  </div>
  <div>
    <div class="doc-id">Document Ref: TP-ISO9001-5S</div>
    <div class="doc-id">Print Date: ${new Date().toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
    <div class="doc-id">System Version: v${(window as any).CONFIG?.APP_VERSION || '98.0.0'}</div>
  </div>
</div>

<div style="display:flex; align-items:flex-start; gap: 16px; margin-bottom: 14px;">
  <div style="flex:1;">
    <h2 style="margin-top:0;">Tool Identity</h2>
    <table class="spec-table">
      <tr><th>Property</th><th>Value</th></tr>
      <tr><td>Tool ID</td><td><strong style="font-family:monospace; font-size:10pt;">${esc(tool.id)}</strong></td></tr>
      <tr><td>Tool Name</td><td><strong>${esc(tool.name)}</strong></td></tr>
      <tr><td>Category</td><td>${esc(tool.category || 'N/A')}</td></tr>
      <tr><td>Type</td><td>${esc(tool.type || 'N/A')}</td></tr>
      <tr><td>Serial / SN</td><td style="font-family:monospace;">${esc(tool.serialNumber || tool.sn || 'N/A')}</td></tr>
      <tr><td>Physical Location</td><td>${esc(tool.location || 'N/A')} ${esc(tool.address ? `[${tool.address.zone || ''} | ${tool.address.rack || ''} ${tool.address.shelf || ''}-${tool.address.bin || ''}]` : '')}</td></tr>
      <tr><td>Current Assignee / Custodian</td><td>${esc(assigneeName)}</td></tr>
      <tr><td>Program / Station</td><td>${esc(tool.program || Store.programOf(Store.workstationAndPostOf(tool).ws) || 'General Tool Crib')}</td></tr>
      <tr><td>Quantity</td><td>${esc(String(tool.qty || 1))}</td></tr>
      <tr><td>Unit Value / Price</td><td>${esc(tool.price !== undefined ? '$' + tool.price.toFixed(2) : 'Not recorded')}</td></tr>
      <tr><td>Calibration Due</td><td>${esc(tool.calDue ? fmtDate(tool.calDue) : 'Not set')}</td></tr>
      <tr><td>Return Due</td><td>${esc(tool.dueReturn ? fmtDate(tool.dueReturn) : 'Open-ended')}</td></tr>
    </table>
  </div>
  <div class="qr-block">
    <h2>Traceability QR</h2>
    <img src="${esc(qrDataUrl)}" alt="QR Link to ${esc(tool.id)}" title="Scan to view digital record" />
    <div style="font-size:7pt; color:#64748b; margin-top:4px; word-break:break-all;">${esc(toolDeeplink(tool.id))}</div>
  </div>
</div>

<h2>Technical Specifications</h2>
<table class="spec-table">
  <thead><tr><th>Specification</th><th>Value</th></tr></thead>
  <tbody>
    <tr><td>Category</td><td>${esc(tool.category || 'N/A')}</td></tr>
    <tr><td>Type / Class</td><td>${esc(tool.type || 'N/A')}</td></tr>
    <tr><td>Serial Number / SN</td><td style="font-family:monospace;">${esc(tool.serialNumber || tool.sn || 'N/A')}</td></tr>
    <tr><td>Physical Location</td><td>${esc(tool.location || 'N/A')} ${esc(tool.address ? `[Zone: ${tool.address.zone || ''}, Rack: ${tool.address.rack || ''}, Shelf: ${tool.address.shelf || ''}, Bin: ${tool.address.bin || ''}]` : '')}</td></tr>
    <tr><td>Current Assignee / Custodian</td><td>${esc(assigneeName)} ${esc(tool.assigneeId ? '(Employee ID: ' + tool.assigneeId + ')' : '')}</td></tr>
    <tr><td>Return Due Date</td><td>${esc(tool.dueReturn ? fmtDate(tool.dueReturn) : 'Not assigned / open-ended')}</td></tr>
    <tr><td>Calibration Due Date</td><td>${esc(tool.calDue ? fmtDate(tool.calDue) : 'Not scheduled')}</td></tr>
    <tr><td>Unit Value / Price</td><td>${esc(tool.price !== undefined ? '$' + tool.price.toFixed(2) + ' USD' : 'Not priced')}</td></tr>
    <tr><td>Article / Part #</td><td>${esc(tool.article || 'N/A')}</td></tr>
  </tbody>
</table>

<h2>Life Cycle &amp; Wear Assessment</h2>
<table class="spec-table">
  <thead><tr><th>Metric</th><th>Value</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td>Wear % (Latest Audit)</td><td style="font-weight:bold;">${esc(String(Store.wearOf(tool)))}%</td><td>${esc((tool.audit_history && tool.audit_history.length > 0) ? (tool.audit_history[tool.audit_history.length - 1].notes || 'No notes') : 'No audit history')}</td></tr>
    <tr><td>Operational Status</td><td style="font-weight:bold; color:${tool.status === 'Overdue' ? '#dc2626' : (tool.status === 'Maintenance' ? '#d97706' : '#16a34a')};">${esc(tool.status || 'Unknown')}</td><td>${esc(tool.status === 'Overdue' ? 'Overdue — action required' : (tool.status === 'Maintenance' ? 'Under maintenance — do not issue' : 'In service'))}</td></tr>
    <tr><td>Commissioned / Accepted</td><td>${esc(tool.commissioned_date ? fmtDate(tool.commissioned_date) : 'Not recorded')}</td><td>ISO 9001 entry-into-service record</td></tr>
    <tr><td>Quantity</td><td>${esc(String(tool.qty || 1))}</td><td>Active inventory count</td></tr>
  </tbody>
</table>

<h2>Maintenance / Calibration Record</h2>
<table class="audit-table">
<thead><tr><th>Date</th><th>Inspector</th><th>Result</th><th>Wear %</th><th>Notes</th></tr></thead>
<tbody>${auditEntries}</tbody>
</table>

<h2>Complete Historical Audit Trail</h2>
<table class="audit-table">
<thead><tr><th>Timestamp</th><th>Event / Action</th></tr></thead>
<tbody>${historyEntries}</tbody>
</table>

<h2>Sign-Off Verification Section (ISO 9001 / 5S)</h2>
<div class="sign-off">
  <div class="sign-box">
    <span class="label">Tool Crib Manager — Signature</span>
    <div class="line"></div>
    <span class="label">Name / Badge</span>
    <div style="font-weight:bold;">__________________________</div>
    <div class="stamp">Verified against digital audit trail · TP-${esc(tool.id)}</div>
  </div>
  <div class="sign-box">
    <span class="label">Quality Inspector — Signature</span>
    <div class="line"></div>
    <span class="label">Name / Badge</span>
    <div style="font-weight:bold;">__________________________</div>
    <div class="stamp">ISO 9001 — Section 8.5 (Traceability)</div>
  </div>
  <div class="sign-box">
    <span class="label">Date &amp; Stamp</span>
    <div class="line"></div>
    <div style="font-weight:bold;">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    <div class="stamp">Stamp: 5S · QUALITY ASSURANCE · TRACEABILITY</div>
  </div>
</div>

<div style="margin-top: 18px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 7pt; color: #94a3b8; text-align: center;">
5S Tool Command Center — ISO 9001 / 5S Quality &amp; Traceability System · Generated electronically · No manual alterations permitted
</div>

</body>
</html>
        `;

        printHtml(passportHtml);
    }
}
