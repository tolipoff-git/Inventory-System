// ============================================================================
// 5S Tool Command Center — CalibrationModal (Verification / Calibration)
// ============================================================================
// Records a verification / calibration event and (optionally) prints the tag.

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { esc, fmtDate, todayISO } from '../../../utils/formatters';
import { toast } from '../../../utils/dom';
import { verifierOptionsHtml, defaultVerifier } from '../../../utils/personnelPicker';
import {
    recordCalibration,
    calDueFrom,
    recordCalibrationBatch,
    workstationAndPostOf,
    toolMatchesQuery,
    requiresCalibration,
    CalibrationInput,
} from '../../../operations/toolOps';
import { printLabelsHtml, buildLabelSheetHtml, drawAllQrsInContainer, STOCKS, LabelFormat } from '../../../labels/labelPrint';
import { Tool } from '../../../types/inventory';

/**
 * Records a verification / calibration event and (optionally) prints the
 * matching verification tag.
 *
 * Two modes:
 *   • `open(toolId)`     — one tool, from its card.
 *   • `openSession()`    — a shelf of tools verified in one go: pick a station,
 *                          tick the tools, stamp the same date / inspector /
 *                          interval, then print a run of tags.
 */
import { labelLayoutControlsHtml, bindLabelLayoutControls, readLabelLayoutControls } from '../labelLayoutControls';

export class CalibrationModal {
    private static modalId = 'calibrationModal';
    private static busy = false;
    private static savedIds: string[] = [];
    private static mode: 'single' | 'session' = 'single';
    private static currentToolId: string | null = null;
    /** Ids ticked in the session list — kept across search/station re-renders. */
    private static sessionSelected = new Set<string>();

    public static open(toolId: string): void {
        const tool = Store.getTool(toolId);
        if (!tool) return;
        if (this.busy) return;
        this.savedIds = [];
        this.mode = 'single';
        this.currentToolId = toolId;
        this.mount();
        this.populateSingle(tool);
        void this.updateLabelPreview();
        this.show();
    }

    public static openSession(): void {
        if (this.busy) return;
        this.savedIds = [];
        this.mode = 'session';
        this.currentToolId = null;
        this.sessionSelected.clear();
        this.mount();
        this.renderSessionList();
        this.show();
    }

    public static close(): void {
        if (this.busy) return;
        const modal = document.getElementById(this.modalId);
        if (modal) modal.classList.remove('active');
        this.currentToolId = null;
    }

    private static show(): void {
        const modal = document.getElementById(this.modalId);
        if (modal) modal.classList.add('active');
    }

    private static mount(): void {
        document.getElementById(this.modalId)?.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.modalId;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.close();
        });

        const today = todayISO();

        // Both entry points print on the user's Avery 5961 sheets by default.
        // Other stocks remain available explicitly.
        const calFormats: LabelFormat[] = ['calTagSheet', 'calTag', 'avery5163', 'genericA', 'genericB'];
        const defaultFormat: LabelFormat = 'calTagSheet';
        const formatOptions = calFormats
            .map(k => {
                const s = STOCKS[k];
                return `<option value="${k}"${k === defaultFormat ? ' selected' : ''}>${esc(s.brand)} ${esc(s.pn)} — ${esc(s.info)}</option>`;
            })
            .join('');

        const sessionBody = this.mode === 'session' ? `
            <div class="form-row">
                <div class="form-group" style="text-align:left;">
                    <label>${T('Station')}:</label>
                    <select id="calSessionStation" class="form-control">
                        <option value="">${T('All Stations')}</option>
                        ${Store.workstations.map(w => `<option value="${esc(w)}">${esc(w)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group" style="text-align:left;">
                    <label>${T('Search')}:</label>
                    <input type="search" id="calSessionSearch" class="form-control" autocomplete="off" placeholder="${T('SEARCH_PH')}">
                </div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin:6px 0;">
                <span style="font-size:0.85rem; color:var(--text-muted);" id="calSessionCount"></span>
                <span>
                    <button class="btn btn-muted" id="calSelectAllBtn" style="font-size:0.8rem; padding:4px 10px;">${T('Select All')}</button>
                    <button class="btn btn-muted" id="calDeselectAllBtn" style="font-size:0.8rem; padding:4px 10px;">${T('Deselect All')}</button>
                </span>
            </div>
            <div id="calSessionList" style="max-height:240px; overflow-y:auto; border:1px solid var(--border); border-radius:6px;"></div>
        ` : '';

        overlay.innerHTML = `
            <div class="modal" style="max-width:560px;">
                <div class="modal-header">
                    <h3 class="modal-title">⚗ ${this.mode === 'session' ? T('Calibration Session') : T('Verification / Calibration')}</h3>
                    <button class="close-btn" id="calCloseBtn">&times;</button>
                </div>
                <div class="modal-body">
                    <div id="calToolInfo" style="font-size:0.95rem; margin-bottom:12px;"></div>
                    ${sessionBody}
                    <div class="form-row">
                        <div class="form-group" style="text-align:left;">
                            <label>${T('Verified by')}:</label>
                            <select id="calBy" class="form-control">${verifierOptionsHtml(defaultVerifier())}</select>
                        </div>
                        <div class="form-group" style="text-align:left;">
                            <label>${T('Verification Date')}:</label>
                            <input type="date" id="calDate" class="form-control" value="${today}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group" style="text-align:left;">
                            <label>${T('Interval (days)')}:</label>
                            <input type="number" id="calInterval" class="form-control" min="1" max="36500" step="1" value="180">
                        </div>
                        <div class="form-group" style="text-align:left;">
                            <label>${T('Certificate #')}:</label>
                            <input type="text" id="calCert" class="form-control">
                        </div>
                        <div class="form-group" style="text-align:left;">
                            <label>${T('Result')}:</label>
                            <select id="calResult" class="form-control">
                                <option value="PASS">PASS</option>
                                <option value="FLAG">FLAG</option>
                                <option value="FAIL">FAIL</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group" style="text-align:left;">
                        <label>${T('Notes')}:</label>
                        <input type="text" id="calNotes" class="form-control">
                    </div>
                    <div class="form-group" style="text-align:left;">
                        <label>${T('Select Label Stock / Format:')}</label>
                        <select id="calFormat" class="form-control">${formatOptions}</select>
                    </div>
                    ${labelLayoutControlsHtml('cal')}
                    <div id="calLabelPreview" style="background:#e2e8f0;padding:10px;border-radius:8px;max-height:340px;overflow:auto;display:flex;justify-content:center;"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="calCancelBtn">${T('Close')}</button>
                    <button class="btn btn-secondary" id="calSaveBtn">${T('Save')}</button>
                    <button class="btn btn-success" id="calSavePrintBtn">🖨 ${this.mode === 'session' ? T('Apply & Print Tags') : T('Save & Print Tag')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        const refreshLayout = bindLabelLayoutControls(overlay, 'cal', () => this.readFormat(), () => { void this.updateLabelPreview(); });
        overlay.querySelector('#calFormat')?.addEventListener('change', refreshLayout);
        for (const id of ['calBy', 'calDate', 'calInterval', 'calCert', 'calResult', 'calNotes']) {
            overlay.querySelector(`#${id}`)?.addEventListener('input', () => { void this.updateLabelPreview(); });
        }

        overlay.querySelector('#calCloseBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#calCancelBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#calSaveBtn')?.addEventListener('click', () => this.submit(false));
        overlay.querySelector('#calSavePrintBtn')?.addEventListener('click', () => this.submit(true));

        if (this.mode === 'session') {
            overlay.querySelector('#calSessionStation')?.addEventListener('change', () => this.renderSessionList());
            overlay.querySelector('#calSessionSearch')?.addEventListener('input', () => this.renderSessionList());
            overlay.querySelector('#calSelectAllBtn')?.addEventListener('click', () => this.toggleAll(true));
            overlay.querySelector('#calDeselectAllBtn')?.addEventListener('click', () => this.toggleAll(false));
        }
    }

    private static populateSingle(tool: Tool): void {
        const info = document.getElementById('calToolInfo');
        if (info) {
            info.innerHTML = `<strong>${esc(tool.id)} — ${esc(tool.name)}</strong><br>
                <span style="color:var(--text-muted);">${T('Location:')} ${esc(tool.location || 'N/A')}</span>`;
        }
        const interval = document.getElementById('calInterval') as HTMLInputElement | null;
        if (interval) interval.value = String(tool.calIntervalDays || 180);
        // Prefer the verifier already recorded on the tool; otherwise leave the picker
        // at its default (the logged-in user, if they are in the personnel registry).
        const by = document.getElementById('calBy') as HTMLSelectElement | null;
        if (by) {
            const want = defaultVerifier(tool.calVerifiedBy);
            by.innerHTML = verifierOptionsHtml(want);
            by.value = want;
        }
    }

    private static renderSessionList(): void {
        const list = document.getElementById('calSessionList');
        if (!list) return;

        const station = (document.getElementById('calSessionStation') as HTMLSelectElement | null)?.value || '';
        const q = ((document.getElementById('calSessionSearch') as HTMLInputElement | null)?.value || '').trim();

        const tools = Store.activeTools().filter(requiresCalibration)
            .filter(t => {
                if (station && workstationAndPostOf(t).ws !== station) return false;
                // Searches the class label (EN/RU), category, spec, program, SN,
                // article, station/post and holder — not just id/name/location.
                return toolMatchesQuery(t, q);
            })
            .sort((a, b) => a.id.localeCompare(b.id));

        if (!tools.length) {
            list.innerHTML = `<div style="padding:12px; color:var(--text-muted); font-size:0.85rem;">${T('NO_TOOLS_MATCH')}</div>`;
            this.updateSessionCount();
            return;
        }

        list.innerHTML = tools.map(t => {
            const cls = t.category || '';
            const wsp = workstationAndPostOf(t);
            const place = [wsp.ws, wsp.post].filter(Boolean).join(' / ');
            return `
            <label style="display:flex; align-items:center; gap:8px; padding:7px 10px; border-bottom:1px solid var(--border); cursor:pointer; font-size:0.85rem;">
                <input type="checkbox" class="cal-session-cb" value="${esc(t.id)}"${this.sessionSelected.has(t.id) ? ' checked' : ''}>
                <span style="font-family:monospace; font-weight:700;">${esc(t.id)}</span>
                <span style="flex:1; overflow:hidden;">
                    <span style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(t.name)}</span>
                    <span style="display:block; color:var(--text-muted); font-size:0.74rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc([cls, place].filter(Boolean).join(' · '))}</span>
                </span>
                <span style="color:var(--text-muted); font-size:0.78rem; white-space:nowrap;">${esc(t.calDue ? fmtDate(t.calDue) : '—')}</span>
            </label>`;
        }).join('');

        list.querySelectorAll<HTMLInputElement>('.cal-session-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                if (cb.checked) this.sessionSelected.add(cb.value);
                else this.sessionSelected.delete(cb.value);
                this.updateSessionCount();
            });
        });
        this.updateSessionCount(tools.length);
    }

    /** All ticked ids — including rows currently hidden by the search/station filter. */
    private static selectedIds(): string[] {
        return Array.from(this.sessionSelected).sort((a, b) => a.localeCompare(b));
    }

    private static updateSessionCount(found?: number): void {
        const el = document.getElementById('calSessionCount');
        if (el) {
            const foundStr = found === undefined ? '' : `${T('Found:')} ${found} · `;
            el.textContent = `${foundStr}${T('Selected:')} ${this.sessionSelected.size}`;
        }
        void this.updateLabelPreview();
    }

    private static toggleAll(on: boolean): void {
        if (!on) this.sessionSelected.clear();
        document.querySelectorAll<HTMLInputElement>('.cal-session-cb').forEach(cb => {
            cb.checked = on;
            if (on) this.sessionSelected.add(cb.value);
            else this.sessionSelected.delete(cb.value);
        });
        this.updateSessionCount();
    }

    private static readInput(): CalibrationInput {
        const by = (document.getElementById('calBy') as HTMLSelectElement | null)?.value.trim() || '';
        const date = (document.getElementById('calDate') as HTMLInputElement | null)?.value || '';
        const intervalDays = Number((document.getElementById('calInterval') as HTMLInputElement | null)?.value);
        const certNo = (document.getElementById('calCert') as HTMLInputElement | null)?.value.trim() || undefined;
        const result = ((document.getElementById('calResult') as HTMLSelectElement | null)?.value || 'PASS') as 'PASS' | 'FAIL' | 'FLAG';
        const notes = (document.getElementById('calNotes') as HTMLInputElement | null)?.value.trim() || undefined;
        return { by, date, intervalDays, certNo, result, notes };
    }

    private static readFormat(): LabelFormat {
        const v = (document.getElementById('calFormat') as HTMLSelectElement | null)?.value;
        return (v && v in STOCKS ? v : 'calTag') as LabelFormat;
    }

    private static async updateLabelPreview(): Promise<void> {
        const host = document.getElementById('calLabelPreview');
        if (!host) return;
        const ids = this.savedIds.length ? this.savedIds : this.mode === 'single' ? [this.currentToolId!].filter(Boolean) : this.selectedIds();
        const format = this.readFormat();
        const stock = STOCKS[format];
        host.innerHTML = `<div class="sheet-mode" style="zoom:${stock.kind === 'sheet' ? 0.3 : 1};flex:0 0 auto;">${buildLabelSheetHtml(ids.map(id => {
            const tool = Store.getTool(id);
            if (!tool || this.savedIds.length) return { id, type: 'tool' as const, content: 'calibration' as const };
            const input = this.readInput();
            const nextDue = input.result === 'PASS' ? calDueFrom(input.date || '', input.intervalDays) : undefined;
            return { id, type: 'tool' as const, content: 'calibration' as const, tool: { ...tool, calVerifiedBy: input.by, calVerifiedAt: input.date, calDue: nextDue, calCertNo: input.certNo, calHistory: [...(tool.calHistory || []), { date: input.date || '', by: input.by || '', result: input.result || 'PASS', certNo: input.certNo, nextDue }] } };
        }), format, readLabelLayoutControls(document, 'cal', format))}</div>`;
        await drawAllQrsInContainer(host);
    }

    private static async submit(print: boolean): Promise<void> {
        if (this.busy) return;
        const input = this.readInput();
        if (!this.savedIds.length && !input.by) {
            toast(T('VERIFIER_REQUIRED'), 'warning');
            return;
        }
        const ids = this.savedIds.length ? this.savedIds : this.mode === 'single' ? [this.currentToolId!].filter(Boolean) : this.selectedIds();
        if (!ids.length) { toast(T('CALIBRATION_NO_SELECTION'), 'warning'); return; }
        if (ids.some(id => !Store.getTool(id) || Store.getTool(id)!.status === 'Decommissioned')) {
            toast(T('CALIBRATION_MISSING_TOOL'), 'warning'); return;
        }
        const format = this.readFormat();
        const opts = readLabelLayoutControls(document, 'cal', format);
        const modal = document.getElementById(this.modalId)!;
        this.busy = true;
        const fields = Array.from(modal.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input,select,button'));
        const disabledBefore = fields.map(field => field.disabled);
        fields.forEach(field => { field.disabled = true; });
        let close = false;
        try {
            if (!this.savedIds.length) {
                if (this.mode === 'single') {
                    if (!await recordCalibration(ids[0], input)) throw new Error(T('CALIBRATION_MISSING_TOOL'));
                    this.savedIds = ids;
                } else {
                    this.savedIds = await recordCalibrationBatch(ids, input);
                }
                toast(`${T('CALIBRATION_SAVED')} ${this.savedIds.length}`, 'success');
            }
            if (print) await printLabelsHtml(this.savedIds.map(id => ({ id, type: 'tool', content: 'calibration' })), format, opts);
            close = true;
        } catch (error) {
            toast(`${T(this.savedIds.length ? 'CALIBRATION_PRINT_RETRY' : 'CALIBRATION_FAILED')}: ${esc((error as Error).message)}`, 'danger');
        } finally {
            this.busy = false;
            fields.forEach((field, i) => { field.disabled = disabledBefore[i]; });
            if (this.savedIds.length && !close) {
                // The saved event is immutable in this dialog. Retrying the
                // printer must not append another calibration history row.
                for (const id of ['calBy', 'calDate', 'calInterval', 'calCert', 'calResult', 'calNotes', 'calSessionStation', 'calSessionSearch', 'calSaveBtn', 'calSelectAllBtn', 'calDeselectAllBtn']) {
                    const field = modal.querySelector<HTMLInputElement>(`#${id}`);
                    if (field) field.disabled = true;
                }
                modal.querySelectorAll<HTMLInputElement>('.cal-session-cb').forEach(cb => { cb.disabled = true; });
                modal.querySelector('#calSavePrintBtn')!.textContent = T('CALIBRATION_REPRINT');
                await this.updateLabelPreview();
            }
        }
        if (close) this.close();
    }
}
