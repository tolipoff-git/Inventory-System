// ============================================================================
// 5S Tool Command Center — CalibrationModal (Verification / Calibration)
// ============================================================================
// Records a verification / calibration event and (optionally) prints the tag.

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { Auth } from '../../../auth/authManager';
import { esc, fmtDate, nowISO } from '../../../utils/formatters';
import { toast } from '../../../utils/dom';
import {
    recordCalibration,
    recordCalibrationBatch,
    workstationAndPostOf,
    toolMatchesQuery,
    CalibrationInput,
} from '../../../operations/toolOps';
import { printLabelsHtml } from '../../../labels/labelPrint';
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
export class CalibrationModal {
    private static modalId = 'calibrationModal';
    private static mode: 'single' | 'session' = 'single';
    private static currentToolId: string | null = null;
    /** Ids ticked in the session list — kept across search/station re-renders. */
    private static sessionSelected = new Set<string>();

    public static open(toolId: string): void {
        const tool = Store.getTool(toolId);
        if (!tool) return;
        this.mode = 'single';
        this.currentToolId = toolId;
        this.mount();
        this.populateSingle(tool);
        this.show();
    }

    public static openSession(): void {
        this.mode = 'session';
        this.currentToolId = null;
        this.sessionSelected.clear();
        this.mount();
        this.renderSessionList();
        this.show();
    }

    public static close(): void {
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

        const user = Auth.getCurrentUser();
        const defaultBy = user && user !== 'operator' ? user : '';
        const today = nowISO().split('T')[0];

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
                            <input type="text" id="calBy" class="form-control" value="${esc(defaultBy)}">
                        </div>
                        <div class="form-group" style="text-align:left;">
                            <label>${T('Verification Date')}:</label>
                            <input type="date" id="calDate" class="form-control" value="${today}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group" style="text-align:left;">
                            <label>${T('Interval (days)')}:</label>
                            <input type="number" id="calInterval" class="form-control" min="1" value="180">
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
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="calCancelBtn">${T('Close')}</button>
                    <button class="btn btn-secondary" id="calSaveBtn">${T('Save')}</button>
                    <button class="btn btn-success" id="calSavePrintBtn">🖨 ${this.mode === 'session' ? T('Apply & Print Tags') : T('Save & Print Tag')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

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
        const by = document.getElementById('calBy') as HTMLInputElement | null;
        if (by && !by.value && tool.calVerifiedBy) by.value = tool.calVerifiedBy;
    }

    private static renderSessionList(): void {
        const list = document.getElementById('calSessionList');
        if (!list) return;

        const station = (document.getElementById('calSessionStation') as HTMLSelectElement | null)?.value || '';
        const q = ((document.getElementById('calSessionSearch') as HTMLInputElement | null)?.value || '').trim();

        const tools = Store.activeTools()
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
        return Array.from(this.sessionSelected);
    }

    private static updateSessionCount(found?: number): void {
        const el = document.getElementById('calSessionCount');
        if (el) {
            const foundStr = found === undefined ? '' : `${T('Found:')} ${found} · `;
            el.textContent = `${foundStr}${T('Selected:')} ${this.sessionSelected.size}`;
        }
    }

    private static toggleAll(on: boolean): void {
        document.querySelectorAll<HTMLInputElement>('.cal-session-cb').forEach(cb => {
            cb.checked = on;
            if (on) this.sessionSelected.add(cb.value);
            else this.sessionSelected.delete(cb.value);
        });
        this.updateSessionCount();
    }

    private static readInput(): CalibrationInput {
        const by = (document.getElementById('calBy') as HTMLInputElement | null)?.value.trim() || '';
        const date = (document.getElementById('calDate') as HTMLInputElement | null)?.value || nowISO().split('T')[0];
        const intervalRaw = parseInt((document.getElementById('calInterval') as HTMLInputElement | null)?.value || '', 10);
        const intervalDays = Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : undefined;
        const certNo = (document.getElementById('calCert') as HTMLInputElement | null)?.value.trim() || undefined;
        const result = ((document.getElementById('calResult') as HTMLSelectElement | null)?.value || 'PASS') as 'PASS' | 'FAIL' | 'FLAG';
        const notes = (document.getElementById('calNotes') as HTMLInputElement | null)?.value.trim() || undefined;
        return { by, date, intervalDays, certNo, result, notes };
    }

    private static async submit(print: boolean): Promise<void> {
        const input = this.readInput();

        try {
            if (this.mode === 'single') {
                if (!this.currentToolId) return;
                const id = this.currentToolId;
                await recordCalibration(id, input);
                toast(`${T('CALIBRATION_SAVED')} ${id}`, 'success');
                if (print) await printLabelsHtml([{ id, type: 'tool' }], 'calTag');
                this.close();
            } else {
                const ids = this.selectedIds();
                if (!ids.length) {
                    toast(T('CALIBRATION_NO_SELECTION'), 'warning');
                    return;
                }
                const updated = await recordCalibrationBatch(ids, input);
                toast(`${T('CALIBRATION_SAVED')} ${updated.length}`, 'success');
                if (print && updated.length) {
                    await printLabelsHtml(updated.map(id => ({ id, type: 'tool' as const })), 'calTag');
                }
                this.close();
            }
        } catch (e: any) {
            toast(`${T('CALIBRATION_FAILED')}: ${e.message}`, 'danger');
        }
    }
}
