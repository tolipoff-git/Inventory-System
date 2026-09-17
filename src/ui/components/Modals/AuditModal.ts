// ============================================================================
// 5S Tool Command Center — AuditModal Component (5S Post Audit & Reports)
// ============================================================================

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { S5_RUBRICS } from '../../../config/constants';
import { submit5SAudit, get5SRubricExplanation } from '../../../operations/auditOps';
import { esc, fmtDate } from '../../../utils/formatters';
import { toast, printHtml } from '../../../utils/dom';
import { exportCertificatePdf, CertificatePdfRow } from '../../../reports/certPdf';
import { buildS5Report, renderS5ReportScreen, renderS5ReportPrint } from '../../../reports/s5Report';

export class AuditModal {
    private static postAuditModalId = 'postAuditModal';
    private static auditHistoryModalId = 'auditHistoryModal';
    private static report5sModalId = 'report5sModal';

    // Open Post Audit Form
    public static openPostAudit(ws?: string, post?: string): void {
        let modal = document.getElementById(this.postAuditModalId);
        if (!modal) {
            this.createPostAuditModalDOM();
            modal = document.getElementById(this.postAuditModalId);
        }
        this.populatePostAuditForm(ws, post);
        if (modal) modal.classList.add('active');
    }

    public static closePostAudit(): void {
        const modal = document.getElementById(this.postAuditModalId);
        if (modal) modal.classList.remove('active');
    }

    // Open Audit History
    public static openHistory(pillarIdx?: number): void {
        let modal = document.getElementById(this.auditHistoryModalId);
        if (!modal) {
            this.createHistoryModalDOM();
            modal = document.getElementById(this.auditHistoryModalId);
        }
        this.renderHistory(pillarIdx);
        if (modal) modal.classList.add('active');
    }

    public static closeHistory(): void {
        const modal = document.getElementById(this.auditHistoryModalId);
        if (modal) modal.classList.remove('active');
    }

    // Open 5S Report
    public static openReport(): void {
        let modal = document.getElementById(this.report5sModalId);
        if (!modal) {
            this.createReportModalDOM();
            modal = document.getElementById(this.report5sModalId);
        }
        this.renderReport();
        if (modal) modal.classList.add('active');
    }

    public static closeReport(): void {
        const modal = document.getElementById(this.report5sModalId);
        if (modal) modal.classList.remove('active');
    }

    private static createPostAuditModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.postAuditModalId;

        const pillars = ['sort', 'setOrder', 'shine', 'standardize', 'sustain'];
        const pillarNames = ['1S — Sort', '2S — Set in Order', '3S — Shine', '4S — Standardize', '5S — Sustain'];

        const rubricSections = pillars.map((p, idx) => `
            <div style="margin-bottom:14px; background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:6px; padding:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <strong style="color:var(--primary-hover);">${pillarNames[idx]}</strong>
                    <span id="auditRubricVal_${p}" style="font-weight:bold; font-size:1.1rem; color:var(--text-main);">4 / 5</span>
                </div>
                <input type="range" min="1" max="5" value="4" class="audit-slider" id="auditSlider_${p}" data-pillar-idx="${idx}" data-pillar-id="${p}" style="width:100%;">
                <div id="auditRubricDesc_${p}" style="font-size:0.82rem; color:var(--text-muted); margin-top:4px; min-height:28px;"></div>
            </div>
        `).join('');

        overlay.innerHTML = `
            <div class="modal narrow" style="max-width:540px;">
                <div class="modal-header">
                    <h3 class="modal-title">📋 ${T('5S Post Audit')}</h3>
                    <button class="close-btn" id="postAuditCloseBtn">&times;</button>
                </div>
                <div class="modal-body" style="max-height:75vh; overflow-y:auto;">
                    <div class="form-row">
                        <div class="form-group">
                            <label>${T('Workstation:')} *</label>
                            <select id="auditWsSelect" class="form-control"></select>
                        </div>
                        <div class="form-group">
                            <label>${T('Workpost:')} *</label>
                            <select id="auditPostSelect" class="form-control"></select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>${T('Auditor Initials:')} *</label>
                        <input type="text" id="auditInspector" class="form-control" placeholder="Initials">
                    </div>

                    <h4 style="margin:12px 0 8px; color:var(--primary-hover);">${T('5S Pillars Scoring (1 to 5)')}</h4>
                    ${rubricSections}

                    <div class="form-group">
                        <label>${T('Kaizen & Improvement Actions:')}</label>
                        <textarea id="auditKaizenNotes" class="form-control" rows="3" placeholder="Identify abnormalities, clutter, or labeling needs…"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="postAuditCancelBtn">${T('Cancel')}</button>
                    <button class="btn btn-success" id="postAuditSubmitBtn">${T('Save Audit Result')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#postAuditCloseBtn')?.addEventListener('click', () => this.closePostAudit());
        overlay.querySelector('#postAuditCancelBtn')?.addEventListener('click', () => this.closePostAudit());
        overlay.querySelector('#postAuditSubmitBtn')?.addEventListener('click', () => this.submitAudit());

        const wsSelect = overlay.querySelector<HTMLSelectElement>('#auditWsSelect');
        if (wsSelect) {
            wsSelect.addEventListener('change', () => {
                this.updatePostSelect(wsSelect.value);
            });
        }

        // Sliders
        overlay.querySelectorAll('.audit-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const target = e.currentTarget as HTMLInputElement;
                const pId = target.dataset.pillarId!;
                const pIdx = +target.dataset.pillarIdx!;
                const score = +target.value;

                const valEl = overlay.querySelector(`#auditRubricVal_${pId}`);
                const descEl = overlay.querySelector(`#auditRubricDesc_${pId}`);

                if (valEl) valEl.textContent = `${score} / 5`;
                if (descEl) descEl.textContent = get5SRubricExplanation(pIdx, score);
            });
        });
    }

    private static populatePostAuditForm(targetWs?: string, targetPost?: string): void {
        const wsSelect = document.getElementById('auditWsSelect') as HTMLSelectElement;
        if (wsSelect) {
            wsSelect.innerHTML = Store.workstations.map(ws => `<option value="${esc(ws)}">${esc(ws)}</option>`).join('');
            if (targetWs && Store.workstations.includes(targetWs)) wsSelect.value = targetWs;
            this.updatePostSelect(wsSelect.value, targetPost);
        }

        // Initialize slider labels
        const pillars = ['sort', 'setOrder', 'shine', 'standardize', 'sustain'];
        pillars.forEach((p, idx) => {
            const slider = document.getElementById(`auditSlider_${p}`) as HTMLInputElement;
            const descEl = document.getElementById(`auditRubricDesc_${p}`);
            if (slider && descEl) {
                slider.value = '4';
                const valEl = document.getElementById(`auditRubricVal_${p}`);
                if (valEl) valEl.textContent = '4 / 5';
                descEl.textContent = get5SRubricExplanation(idx, 4);
            }
        });

        (document.getElementById('auditInspector') as HTMLInputElement).value = '';
        (document.getElementById('auditKaizenNotes') as HTMLTextAreaElement).value = '';
    }

    private static updatePostSelect(ws: string, targetPost?: string): void {
        const postSelect = document.getElementById('auditPostSelect') as HTMLSelectElement;
        if (!postSelect) return;
        const posts = Store.postsForZone(ws);
        postSelect.innerHTML = posts.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
        if (targetPost && posts.includes(targetPost)) {
            postSelect.value = targetPost;
        }
    }

    private static async submitAudit(): Promise<void> {
        const ws = (document.getElementById('auditWsSelect') as HTMLSelectElement).value;
        const post = (document.getElementById('auditPostSelect') as HTMLSelectElement).value;
        const auditor = (document.getElementById('auditInspector') as HTMLInputElement).value.trim();
        const kaizen = (document.getElementById('auditKaizenNotes') as HTMLTextAreaElement).value.trim();

        if (!auditor) {
            toast('Auditor initials required.', 'warning');
            return;
        }

        const scores: any = {
            sort: +((document.getElementById('auditSlider_sort') as HTMLInputElement).value || 4),
            setOrder: +((document.getElementById('auditSlider_setOrder') as HTMLInputElement).value || 4),
            shine: +((document.getElementById('auditSlider_shine') as HTMLInputElement).value || 4),
            standardize: +((document.getElementById('auditSlider_standardize') as HTMLInputElement).value || 4),
            sustain: +((document.getElementById('auditSlider_sustain') as HTMLInputElement).value || 4)
        };

        try {
            await submit5SAudit(ws, post, auditor, scores, kaizen);
            toast('5S Audit successfully logged!', 'success');
            this.closePostAudit();
        } catch (e: any) {
            toast(`Failed to save audit: ${e.message}`, 'danger');
        }
    }

    private static createHistoryModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.auditHistoryModalId;

        overlay.innerHTML = `
            <div class="modal wide" style="max-width:850px;">
                <div class="modal-header">
                    <h3 class="modal-title">📋 ${T('AUDIT_HISTORY')}</h3>
                    <button class="close-btn" id="auditHistoryCloseBtn">&times;</button>
                </div>
                <div class="modal-body" style="max-height:75vh; overflow-y:auto;" id="auditHistoryBody"></div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="auditHistoryFooterCloseBtn">${T('Close')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#auditHistoryCloseBtn')?.addEventListener('click', () => this.closeHistory());
        overlay.querySelector('#auditHistoryFooterCloseBtn')?.addEventListener('click', () => this.closeHistory());
    }

    private static renderHistory(pillarIdx?: number): void {
        const body = document.getElementById('auditHistoryBody');
        if (!body) return;

        const audits = Store.audits5s || [];
        if (!audits.length) {
            body.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">${T('No audits logged yet.')}</div>`;
            return;
        }

        const pillarKeys = ['sort', 'setOrder', 'shine', 'standardize', 'sustain'];
        const pKey = pillarIdx !== undefined ? pillarKeys[pillarIdx] : null;

        const rows = [...audits].reverse().map(a => {
            const scoreVal = pKey ? (a.scores[pKey] || 0) : ((a.scores.sort + a.scores.setOrder + a.scores.shine + a.scores.standardize + a.scores.sustain) / 5).toFixed(1);
            const wsLabel = a.ws || a.zone || 'N/A';
            const postLabel = a.post || '';
            return `
            <tr>
                <td>${fmtDate(a.date)}</td>
                <td><strong>${esc(wsLabel)}${postLabel ? ' | ' + esc(postLabel) : ''}</strong></td>
                <td>${esc(a.auditor || a.inspector || 'N/A')}</td>
                <td><strong style="color:var(--primary-hover); font-size:1.05rem;">${scoreVal}</strong></td>
                <td>${esc(a.notes || '—')}</td>
            </tr>
            `;
        }).join('');

        body.innerHTML = `
            <div class="table-scroll">
                <table>
                    <thead>
                        <tr>
                            <th>${T('Date')}</th>
                            <th>${T('Station & Post')}</th>
                            <th>${T('Auditor')}</th>
                            <th>${pKey ? `${S5_RUBRICS[pillarIdx!].key} Score` : 'Avg 5S Score'}</th>
                            <th>${T('Notes')}</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    private static createReportModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.report5sModalId;

        overlay.innerHTML = `
            <div class="modal wide" style="max-width:850px;">
                <div class="modal-header">
                    <h3 class="modal-title">📋 5S Production Engineering Audit Report</h3>
                    <button class="close-btn" id="report5sCloseBtn">&times;</button>
                </div>
                <div class="modal-body" style="max-height:75vh; overflow-y:auto;" id="report5sContent"></div>
                <div class="modal-footer">
                    <button class="btn btn-primary" id="report5sExportPdfBtn">⬇ ${T('Export PDF')}</button>
                    <button class="btn btn-warning" id="report5sPrintBtn">🖨 ${T('Print Certificate')}</button>
                    <button class="btn btn-muted" id="report5sFooterCloseBtn">${T('Close')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#report5sCloseBtn')?.addEventListener('click', () => this.closeReport());
        overlay.querySelector('#report5sFooterCloseBtn')?.addEventListener('click', () => this.closeReport());
        overlay.querySelector('#report5sPrintBtn')?.addEventListener('click', () => {
            printHtml(renderS5ReportPrint(buildS5Report()));
        });
        overlay.querySelector('#report5sExportPdfBtn')?.addEventListener('click', () => {
            this.exportReportPdf();
        });
    }

    private static exportReportPdf(): void {
        const content = document.getElementById('report5sContent');
        if (!content) return;

        const audits = Store.audits5s || [];
        // `Store.audits5s` is newest-first (auditOps unshifts), so index 0 is the latest audit.
        const latest = audits[0];

        const pillarKeys = ['sort', 'setOrder', 'shine', 'standardize', 'sustain'];
        const pillarNames = ['1S — Sort', '2S — Set in Order', '3S — Shine', '4S — Standardize', '5S — Sustain'];

        const rows: CertificatePdfRow[] = pillarKeys.map((p, idx) => {
            const score = latest && latest.scores ? (latest.scores[p] || 0) : ((document.getElementById(`auditSlider_${p}`) as HTMLInputElement)?.value || 4);
            return { id: String(idx + 1), name: pillarNames[idx], score: +score };
        });

        const namedDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const today = new Date();
        const dateStr = latest ? latest.date : `${namedDays[today.getDay()]}, ${today.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][today.getMonth()]} ${today.getFullYear()}`;

        const wsValue = latest?.ws || latest?.zone || (document.getElementById('auditWsSelect') as HTMLSelectElement)?.value || '—';
        const postValue = latest?.post || '';
        const auditorValue = latest?.auditor || latest?.inspector || (document.getElementById('auditInspector') as HTMLInputElement)?.value || '—';
        const notesValue = latest?.notes || (document.getElementById('auditKaizenNotes') as HTMLTextAreaElement)?.value || '';

        const compliancePct: number = latest?.totalScore ?? 100;

        exportCertificatePdf({
            title: T('CERT_TITLE'),
            subtitle: T('CERT_SUBTITLE'),
            station: wsValue,
            post: postValue,
            date: dateStr,
            auditor: auditorValue,
            compliance: `${compliancePct}%`,
            rows,
            notes: notesValue
        });
    }

    private static renderReport(): void {
        const content = document.getElementById('report5sContent');
        if (!content) return;
        content.innerHTML = renderS5ReportScreen(buildS5Report());
    }
}
