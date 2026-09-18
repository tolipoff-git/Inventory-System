// ============================================================================
// 5S Tool Command Center — LabelModal Component (Print Labels & Previews)
// ============================================================================

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { esc } from '../../../utils/formatters';
import { generateQrDataUrl } from '../../../labels/qrGenerator';
import { requiresCalibration } from '../../../operations/toolOps';
import { printLabelsHtml, printQueueLabels, buildLabelSheetHtml, drawAllQrsInContainer, STOCKS, LabelFormat } from '../../../labels/labelPrint';
import { toast, printHtml } from '../../../utils/dom';

export class LabelModal {
    private static printModalId = 'printLabelModal';
    private static locModalId = 'locationLabelModal';
    private static queueModalId = 'queueLabelModal';
    private static currentToolId: string | null = null;
    private static selectedFormat: LabelFormat = 'avery5161';

    public static async openToolLabel(toolId: string): Promise<void> {
        this.currentToolId = toolId;
        const tool = Store.getTool(toolId);
        if (!tool) return;

        let modal = document.getElementById(this.printModalId);
        if (!modal) {
            this.createPrintModalDOM();
            modal = document.getElementById(this.printModalId);
        }

        await this.updatePreview(tool);
        this.updateQueueState();

        // The verification tag is only meaningful for classes that require
        // verification — hide it for a socket head / hammer and fall back to a
        // plain tool label if it was the last-used format.
        const needsCal = requiresCalibration(tool);
        const calOpt = modal?.querySelector<HTMLOptionElement>('#labelFormatSelect option[value="calTag"]');
        if (calOpt) {
            calOpt.disabled = !needsCal;
            calOpt.hidden = !needsCal;
            if (!needsCal && this.selectedFormat === 'calTag') {
                this.selectedFormat = 'avery5161';
                const sel = modal?.querySelector<HTMLSelectElement>('#labelFormatSelect');
                if (sel) sel.value = 'avery5161';
            }
        }

        if (modal) modal.classList.add('active');
    }

    public static closeToolLabel(): void {
        const modal = document.getElementById(this.printModalId);
        if (modal) modal.classList.remove('active');
        this.currentToolId = null;
    }

    public static openLocationLabels(): void {
        let modal = document.getElementById(this.locModalId);
        if (!modal) {
            this.createLocationModalDOM();
            modal = document.getElementById(this.locModalId);
        }

        this.populateLocationForm();
        if (modal) modal.classList.add('active');
    }

    public static closeLocationLabels(): void {
        const modal = document.getElementById(this.locModalId);
        if (modal) modal.classList.remove('active');
    }

    /**
     * Print the whole label queue on a chosen stock — the monolith's "Print Queue".
     * The header 🏷 button opens this so the sheet can be generated *after* the
     * labels have been collected, on Avery 5161 or any other wired format.
     */
    public static openQueue(): void {
        if (!Store.labelQueue?.length) {
            toast(T('LABEL_QUEUE_EMPTY'), 'info');
            return;
        }
        document.getElementById(this.queueModalId)?.remove();
        this.createQueueModalDOM();
        document.getElementById(this.queueModalId)?.classList.add('active');
    }

    public static closeQueue(): void {
        document.getElementById(this.queueModalId)?.classList.remove('active');
    }

    private static createQueueModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.queueModalId;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.closeQueue();
        });

        const q = Store.labelQueue || [];
        // Curated list: the canonical stocks, without the legacy aliases (brady/
        // brady119, genA/genericA) that would otherwise appear twice.
        const formats: LabelFormat[] = ['avery5161', 'avery5163', 'avery5366', 'brady', 'genericA', 'genericB', 'genericC', 'calTag'];
        const options = formats
            .map(k => {
                const s = STOCKS[k];
                return `<option value="${k}"${k === this.selectedFormat ? ' selected' : ''}>${esc(s.brand)} ${esc(s.pn)} — ${esc(s.info)}</option>`;
            })
            .join('');

        overlay.innerHTML = `
            <div class="modal" style="max-width:540px;">
                <div class="modal-header">
                    <h3 class="modal-title">🏷 ${T('Print Queue')} (${q.length})</h3>
                    <button class="close-btn" id="queueCloseBtn">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group" style="text-align:left;">
                        <label>${T('Select Label Stock / Format:')}</label>
                        <select id="queueFormatSelect" class="form-control">${options}</select>
                    </div>
                    <div class="form-group" style="text-align:left;" id="queueStartGroup">
                        <label>${T('Start position')}:</label>
                        <input type="number" id="queueStartInput" class="form-control" value="1" min="1">
                    </div>
                    <div style="text-align:left; font-size:0.85rem; color:var(--text-muted); max-height:150px; overflow-y:auto; border:1px solid var(--border); border-radius:6px; padding:8px;">
                        ${q.map(id => `<div style="font-family:monospace;">• ${esc(id)}</div>`).join('')}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="queueCancelBtn">${T('Close')}</button>
                    <button class="btn btn-danger" id="queueClearBtn">${T('Clear')}</button>
                    <button class="btn btn-success" id="queuePrintBtn">🖨 ${T('Print Now')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const fmtSel = overlay.querySelector<HTMLSelectElement>('#queueFormatSelect');
        const startGroup = overlay.querySelector<HTMLElement>('#queueStartGroup');
        const syncStart = () => {
            const stock = STOCKS[(fmtSel?.value || 'avery5161') as LabelFormat];
            if (startGroup) startGroup.style.display = stock && stock.kind === 'sheet' ? '' : 'none';
        };
        fmtSel?.addEventListener('change', syncStart);
        syncStart();

        overlay.querySelector('#queueCloseBtn')?.addEventListener('click', () => this.closeQueue());
        overlay.querySelector('#queueCancelBtn')?.addEventListener('click', () => this.closeQueue());
        overlay.querySelector('#queueClearBtn')?.addEventListener('click', () => {
            Store.clearLabelQueue();
            toast(T('LABEL_QUEUE_CLEARED'), 'info');
            this.closeQueue();
        });
        overlay.querySelector('#queuePrintBtn')?.addEventListener('click', async () => {
            const format = (fmtSel?.value || 'avery5161') as LabelFormat;
            this.selectedFormat = format;
            const raw = parseInt((overlay.querySelector('#queueStartInput') as HTMLInputElement | null)?.value || '1', 10);
            const start = Number.isFinite(raw) && raw > 0 ? raw : 1;
            this.closeQueue();
            await printQueueLabels(format, { start });
        });
    }

    private static createPrintModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.printModalId;

        overlay.innerHTML = `
            <div class="modal" style="max-width:520px; text-align:center;">
                <div class="modal-header">
                    <h3 class="modal-title">🖨 ${T('Print Label Preview')}</h3>
                    <button class="close-btn" id="printModalCloseBtn">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group" style="text-align:left;">
                        <label>${T('Select Label Stock / Format:')}</label>
                        <select id="labelFormatSelect" class="form-control">
                            <option value="avery5161" selected>Avery 5161 (1" × 4", 20 per sheet)</option>
                            <option value="avery5163">Avery 5163 (2" × 4", 10 per sheet)</option>
                            <option value="avery5366">Avery 5366 (2/3" × 3-7/16", File Folder)</option>
                            <option value="brady">Brady BMP Continuous Industrial Roll</option>
                            <option value="genericA">Generic A (Compact 38×19mm)</option>
                            <option value="genericB">Generic B (Standard 50×25mm)</option>
                            <option value="genericC">Generic C (Large 70×36mm)</option>
                            <option value="calTag">Calibration Tag (70×50mm)</option>
                        </select>
                    </div>

                    <div style="background:#e2e8f0; padding:20px; border-radius:8px; margin-top:14px; min-height:140px; display:flex; justify-content:center; align-items:center;" id="labelPreviewContainer"></div>

                    <div class="form-row" style="margin-top:14px;">
                        <div class="form-group" style="text-align:left;">
                            <label>${T('Copies to Print:')}</label>
                            <input type="number" id="labelCopiesInput" class="form-control" value="1" min="1" max="100">
                        </div>
                        <div class="form-group" style="text-align:left;" id="labelStartGroup">
                            <label>${T('Start Position:')}</label>
                            <input type="number" id="labelStartInput" class="form-control" value="1" min="1">
                            <small style="color:var(--text-muted); font-size:0.75rem;">${T('START_POS_HINT')}</small>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="printModalCancelBtn">${T('Close')}</button>
                    <button class="btn btn-secondary" id="modalQueueToggleBtn">+ ${T('Add to Queue')}</button>
                    <button class="btn btn-primary" id="modalPrintQueueBtn" style="display:none;">🖨 ${T('Print Queue')}</button>
                    <button class="btn btn-success" id="printModalExecuteBtn">🖨 ${T('Print Now')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#printModalCloseBtn')?.addEventListener('click', () => this.closeToolLabel());
        overlay.querySelector('#printModalCancelBtn')?.addEventListener('click', () => this.closeToolLabel());

        overlay.querySelector('#modalQueueToggleBtn')?.addEventListener('click', () => {
            if (this.currentToolId) {
                Store.toggleLabelQueue(this.currentToolId);
                this.updateQueueState();
                const inQueue = Store.isInLabelQueue(this.currentToolId);
                toast(inQueue ? `Added ${this.currentToolId} to print queue.` : `Removed ${this.currentToolId} from queue.`, 'info');
            }
        });

        overlay.querySelector('#modalPrintQueueBtn')?.addEventListener('click', async () => {
            await printQueueLabels(this.selectedFormat, { start: this.readStartPosition() });
            this.closeToolLabel();
        });

        const formatSelect = overlay.querySelector<HTMLSelectElement>('#labelFormatSelect');
        if (formatSelect) {
            formatSelect.addEventListener('change', async () => {
                this.selectedFormat = formatSelect.value as LabelFormat;
                this.updateStartPositionVisibility();
                if (this.currentToolId) {
                    const tool = Store.getTool(this.currentToolId);
                    if (tool) await this.updatePreview(tool);
                }
            });
        }
        this.updateStartPositionVisibility();

        overlay.querySelector('#printModalExecuteBtn')?.addEventListener('click', () => this.executePrint());
    }

    /** The start-cell control only applies to die-cut sheet stock. */
    private static updateStartPositionVisibility(): void {
        const group = document.getElementById('labelStartGroup');
        if (!group) return;
        const stock = STOCKS[this.selectedFormat];
        group.style.display = stock && stock.kind === 'sheet' ? '' : 'none';
    }

    private static readStartPosition(): number {
        const el = document.getElementById('labelStartInput') as HTMLInputElement | null;
        const n = parseInt(el?.value || '1', 10);
        return Number.isFinite(n) && n > 0 ? n : 1;
    }

    private static updateQueueState(): void {
        const qBtn = document.getElementById('modalQueueToggleBtn');
        if (qBtn && this.currentToolId) {
            const inQueue = Store.isInLabelQueue(this.currentToolId);
            qBtn.innerText = inQueue ? '✓ In Queue' : `+ ${T('Add to Queue')}`;
            qBtn.className = inQueue ? 'btn btn-warning' : 'btn btn-secondary';
        }
        const qPrintBtn = document.getElementById('modalPrintQueueBtn');
        const qLen = Store.labelQueue.length;
        if (qPrintBtn) {
            qPrintBtn.style.display = qLen > 0 ? 'inline-block' : 'none';
            qPrintBtn.innerText = `🖨 ${T('Print Queue')} (${qLen})`;
        }
    }

    /**
     * Live preview of the *actual* layout that will be printed — the monolith
     * rendered the real sheet here, so the operator sees the correct Avery cell
     * (and not a lone centred label) before pressing Print.
     */
    private static async updatePreview(tool: any): Promise<void> {
        const container = document.getElementById('labelPreviewContainer');
        if (!container) return;

        const stock = STOCKS[this.selectedFormat] || STOCKS.avery5161;
        const html = buildLabelSheetHtml(
            [{ id: tool.id, type: 'tool' }],
            this.selectedFormat,
            { start: this.readStartPosition() }
        );

        // Sheet stock is a full Letter page (~1056px tall at 96dpi) — shrink it to
        // fit the modal; roll / single stock is shown close to 1:1.
        const zoom = stock.kind === 'sheet' ? 0.3 : stock.w < 40 ? 2.2 : 1;
        container.innerHTML = `<div class="sheet-mode" style="zoom:${zoom}; flex:0 0 auto;">${html}</div>`;
        const inner = container.querySelector<HTMLElement>('.sheet-mode');
        if (inner) await drawAllQrsInContainer(inner);
    }

    private static async executePrint(): Promise<void> {
        if (!this.currentToolId) return;
        const tool = Store.getTool(this.currentToolId);
        if (!tool) return;

        const copies = parseInt((document.getElementById('labelCopiesInput') as HTMLInputElement).value) || 1;
        const entities = Array.from({ length: copies }, () => ({ id: tool.id, type: 'tool' as const }));

        await printLabelsHtml(entities, this.selectedFormat, { start: this.readStartPosition() });
        toast(`${T('LABELS_PRINTED')} ${copies}`, 'success');
        this.closeToolLabel();
    }

    private static createLocationModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.locModalId;

        overlay.innerHTML = `
            <div class="modal" style="max-width:580px;">
                <div class="modal-header">
                    <h3 class="modal-title">🖨 ${T('Print Storage Labels')}</h3>
                    <button class="close-btn" id="locModalCloseBtn">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-row">
                        <div class="form-group">
                            <label>${T('Location Type:')}</label>
                            <select id="locTypeSelect" class="form-control">
                                <option value="RACK">Rack Storage</option>
                                <option value="WORKBENCH">Workbench Post</option>
                                <option value="TOOLBOX">Mobile Toolbox</option>
                                <option value="AFRAME">A-Frame Cart</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>${T('Zone / Workstation:')}</label>
                            <select id="locZoneSelect" class="form-control"></select>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label>${T('Rack Letter:')}</label>
                            <input type="text" id="locRackInput" class="form-control" value="A" placeholder="e.g. A" list="locRackList">
                            <datalist id="locRackList"></datalist>
                        </div>
                        <div class="form-group">
                            <label>${T('Shelf Range:')}</label>
                            <input type="text" id="locShelfInput" class="form-control" value="1-4" placeholder="e.g. 1-4 or 1" list="locShelfList">
                            <datalist id="locShelfList"></datalist>
                        </div>
                        <div class="form-group">
                            <label>${T('Bin Range:')}</label>
                            <input type="text" id="locBinInput" class="form-control" value="1-12" placeholder="e.g. 1-12" list="locBinList">
                            <datalist id="locBinList"></datalist>
                        </div>
                    </div>

                    <div class="form-group">
                        <label>${T('Responsible Person / Lead:')}</label>
                        <input type="text" id="locRespInput" class="form-control" placeholder="e.g. Lead Tech John D.">
                    </div>

                    <div id="locPreviewCard" style="background:#e2e8f0; padding:15px; border-radius:8px; margin-top:12px; display:flex; justify-content:center;"></div>
                </div>
                <div class="modal-footer spread">
                    <button class="btn btn-muted" id="locModalCancelBtn">${T('Cancel')}</button>
                    <button class="btn btn-secondary" id="btnLocQueue">+ ${T('Add to Queue')}</button>
                    <button class="btn btn-warning" id="locModalPrintBtn">🖨 ${T('Generate & Print Labels')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#locModalCloseBtn')?.addEventListener('click', () => this.closeLocationLabels());
        overlay.querySelector('#locModalCancelBtn')?.addEventListener('click', () => this.closeLocationLabels());
        overlay.querySelector('#locModalPrintBtn')?.addEventListener('click', () => this.executeLocationPrint());
        overlay.querySelector('#btnLocQueue')?.addEventListener('click', () => {
            const type = (document.getElementById('locTypeSelect') as HTMLSelectElement)?.value || 'RACK';
            const zone = (document.getElementById('locZoneSelect') as HTMLSelectElement)?.value || 'Line 1';
            const rack = (document.getElementById('locRackInput') as HTMLInputElement)?.value.trim() || 'A';
            const shelf = (document.getElementById('locShelfInput') as HTMLInputElement)?.value.trim() || '1';
            const bin = (document.getElementById('locBinInput') as HTMLInputElement)?.value.trim() || '1';
            const locId = `LOC:${type}:${zone}:${rack}:${shelf}:${bin}`;
            Store.addToLabelQueue(locId);
            toast(`Added storage location ${locId} to print queue.`, 'success');
        });

        ['locTypeSelect', 'locZoneSelect', 'locRackInput', 'locShelfInput', 'locBinInput', 'locRespInput'].forEach(id => {
            overlay.querySelector(`#${id}`)?.addEventListener('input', () => this.updateLocationPreview());
            overlay.querySelector(`#${id}`)?.addEventListener('change', () => this.updateLocationPreview());
        });
    }

    private static populateLocationForm(): void {
        const zoneSelect = document.getElementById('locZoneSelect') as HTMLSelectElement;
        if (zoneSelect) {
            zoneSelect.innerHTML = Store.workstations.map(ws => `<option value="${esc(ws)}">${esc(ws)}</option>`).join('');
        }

        const racks = new Set<string>();
        const shelves = new Set<string>();
        const bins = new Set<string>();
        Store.tools.forEach(t => {
            if (t.address) {
                if (t.address.rack) racks.add(t.address.rack);
                if (t.address.shelf) shelves.add(t.address.shelf);
                if (t.address.bin) bins.add(t.address.bin);
            }
            if (t.location && t.location.includes('-')) {
                const parts = t.location.split('-');
                if (parts[1]) racks.add(parts[1]);
                if (parts[2]) shelves.add(parts[2]);
            }
        });

        const rList = document.getElementById('locRackList');
        if (rList) rList.innerHTML = Array.from(racks).sort().map(r => `<option value="${esc(r)}"></option>`).join('');
        const sList = document.getElementById('locShelfList');
        if (sList) sList.innerHTML = Array.from(shelves).sort().map(s => `<option value="${esc(s)}"></option>`).join('');
        const bList = document.getElementById('locBinList');
        if (bList) bList.innerHTML = Array.from(bins).sort().map(b => `<option value="${esc(b)}"></option>`).join('');

        this.updateLocationPreview();
    }

    private static async updateLocationPreview(): Promise<void> {
        const card = document.getElementById('locPreviewCard');
        if (!card) return;
        const type = (document.getElementById('locTypeSelect') as HTMLSelectElement)?.value || 'RACK';
        const zone = (document.getElementById('locZoneSelect') as HTMLSelectElement)?.value || 'Line 1';
        const rack = (document.getElementById('locRackInput') as HTMLInputElement)?.value.trim() || 'A';
        const shelf = (document.getElementById('locShelfInput') as HTMLInputElement)?.value.trim() || '1';
        const bin = (document.getElementById('locBinInput') as HTMLInputElement)?.value.trim() || '1';
        const resp = (document.getElementById('locRespInput') as HTMLInputElement)?.value.trim() || 'Plant Operations';
        const code = `LOC:${type}:${zone}:${rack}:${shelf}:${bin}`;
        const qrUrl = await generateQrDataUrl(code);
        card.innerHTML = `
            <div style="background:#fff; color:#000; border:2px solid #000; border-radius:6px; padding:10px 14px; display:flex; align-items:center; gap:12px; width:340px; box-shadow:0 2px 8px rgba(0,0,0,0.1); font-family:var(--font-mono);">
                <img src="${qrUrl}" style="width:72px; height:72px; flex-shrink:0;">
                <div style="line-height:1.3; overflow:hidden;">
                    <div style="font-weight:bold; font-size:1.05rem;">📍 ${esc(type)} · Rack ${esc(rack)}</div>
                    <div style="font-size:0.85rem;">${esc(zone)} · Shelf ${esc(shelf)} · Bin ${esc(bin)}</div>
                    <div style="font-size:0.72rem; color:#64748b; margin-top:2px;">Resp: ${esc(resp)}</div>
                </div>
            </div>
        `;
    }

    private static async executeLocationPrint(): Promise<void> {
        const type = (document.getElementById('locTypeSelect') as HTMLSelectElement).value;
        const zone = (document.getElementById('locZoneSelect') as HTMLSelectElement).value;
        const rack = (document.getElementById('locRackInput') as HTMLInputElement).value.trim() || 'A';
        const shelf = (document.getElementById('locShelfInput') as HTMLInputElement).value.trim() || '1';
        const bin = (document.getElementById('locBinInput') as HTMLInputElement).value.trim() || '1';
        const resp = (document.getElementById('locRespInput') as HTMLInputElement).value.trim() || 'Plant Operations';

        const code = `LOC:${type}:${zone}:${rack}:${shelf}:${bin}:${resp}`;
        const qrUrl = await generateQrDataUrl(code);

        const html = `
            <div style="display:flex; flex-wrap:wrap; gap:15px; padding:20px; font-family:var(--font-mono); color:#000;">
                <div style="width:320px; border:2px solid #000; border-radius:6px; padding:12px; display:flex; align-items:center; gap:12px; background:#fff;">
                    <img src="${qrUrl}" style="width:85px; height:85px;">
                    <div>
                        <div style="font-weight:bold; font-size:1.15rem;">📍 ${esc(type)} · Rack ${esc(rack)}</div>
                        <div style="font-size:0.9rem;">${esc(zone)} · Shelf ${esc(shelf)} · Bin ${esc(bin)}</div>
                        <div style="font-size:0.75rem; color:#555; margin-top:4px;">Resp: ${esc(resp)}</div>
                    </div>
                </div>
            </div>
        `;

        printHtml(html);
        toast('Location labels sent to printer.', 'success');
        this.closeLocationLabels();
    }
}
