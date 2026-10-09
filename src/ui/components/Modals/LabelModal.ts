// ============================================================================
// 5S Tool Command Center — LabelModal Component (Print Labels & Previews)
// ============================================================================

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { esc } from '../../../utils/formatters';
import { requiresCalibration } from '../../../operations/toolOps';
import { printLabelsHtml, printQueueLabels, buildLabelSheetHtml, drawAllQrsInContainer, queueLabelEntities, STOCKS, LabelFormat, LabelEntity, LabelLayoutOptions } from '../../../labels/labelPrint';
import { toast } from '../../../utils/dom';

import { labelLayoutControlsHtml, bindLabelLayoutControls, readLabelLayoutControls } from '../labelLayoutControls';

export class LabelModal {
    private static printModalId = 'printLabelModal';
    private static locModalId = 'locationLabelModal';
    private static queueModalId = 'queueLabelModal';
    private static currentToolId: string | null = null;
    private static selectedFormat: LabelFormat = 'avery5161';
    private static refreshToolLayout: (() => void) | null = null;

    public static async openToolLabel(toolId: string): Promise<void> {
        this.currentToolId = toolId;
        const tool = Store.getTool(toolId);
        if (!tool) return;

        let modal = document.getElementById(this.printModalId);
        if (!modal) {
            this.createPrintModalDOM();
            modal = document.getElementById(this.printModalId);
        }

        // The verification tag is only meaningful for classes that require
        // verification — hide it for a socket head / hammer and fall back to a
        // plain tool label if it was the last-used format.
        const needsCal = requiresCalibration(tool);
        const calOpts = modal?.querySelectorAll<HTMLOptionElement>('#labelFormatSelect option[value="calTag"], #labelFormatSelect option[value="calTagSheet"]');
        calOpts?.forEach(opt => {
            opt.disabled = !needsCal;
            opt.hidden = !needsCal;
        });
        if (!needsCal && (this.selectedFormat === 'calTag' || this.selectedFormat === 'calTagSheet')) {
            this.selectedFormat = 'avery5161';
            const sel = modal?.querySelector<HTMLSelectElement>('#labelFormatSelect');
            if (sel) sel.value = 'avery5161';
        }

        if (needsCal && (tool.calVerifiedAt || tool.calHistory?.length)) this.selectedFormat = 'calTagSheet';
        const select = modal?.querySelector<HTMLSelectElement>('#labelFormatSelect');
        if (select) select.value = this.selectedFormat;
        this.refreshToolLayout?.();
        await this.updatePreview(tool);
        this.updateQueueState();
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
        const formats: LabelFormat[] = ['avery5161', 'avery5163', 'avery5366', 'calTagSheet', 'calTag', 'brady', 'genericA', 'genericB', 'genericC'];
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
                    ${labelLayoutControlsHtml('queue')}
                    <div class="form-group" style="text-align:left;">
                        <label>${T('Print Label Preview')}:</label>
                        <div id="queuePreview" style="background:#e2e8f0; padding:10px; border-radius:8px; min-height:120px; max-height:340px; overflow:auto; display:flex; justify-content:center;"></div>
                    </div>
                    <div style="text-align:left; font-size:0.85rem; color:var(--text-muted); max-height:150px; overflow-y:auto; border:1px solid var(--border); border-radius:6px; padding:8px;">
                        ${q.map(id => `<div style="font-family:monospace;">• ${esc(id)}</div>`).join('')}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="queueCancelBtn">${T('Close')}</button>
                    <button class="btn btn-danger" id="queueClearBtn">🗑 ${T('Clear Queue')}</button>
                    <button class="btn btn-success" id="queuePrintBtn">🖨 ${T('Print Now')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const fmtSel = overlay.querySelector<HTMLSelectElement>('#queueFormatSelect');
        const previewHost = overlay.querySelector<HTMLElement>('#queuePreview');
        const format = () => (fmtSel?.value || 'avery5161') as LabelFormat;
        const refresh = () => {
            if (previewHost) void this.renderQueuePreview(previewHost, format(), readLabelLayoutControls(overlay, 'queue', format()));
        };
        const refreshLayout = bindLabelLayoutControls(overlay, 'queue', format, refresh);
        fmtSel?.addEventListener('change', refreshLayout);

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
            const button = overlay.querySelector<HTMLButtonElement>('#queuePrintBtn')!;
            button.disabled = true;
            try {
                await printQueueLabels(format, readLabelLayoutControls(overlay, 'queue', format));
                this.closeQueue();
            } catch (error) {
                toast(`${T('LABEL_PRINT_FAILED')} ${esc((error as Error).message)}`, 'danger');
            } finally { button.disabled = false; }
        });
    }

    /**
     * Live preview of the whole queued run, laid out in queue order on the chosen
     * stock — the same `buildLabelSheetHtml()` output the printer receives, so the
     * operator can see every label and its cell before printing.
     */
    private static async renderQueuePreview(host: HTMLElement, format: LabelFormat, opts: LabelLayoutOptions): Promise<void> {
        const entities: LabelEntity[] = queueLabelEntities();
        if (!entities.length) {
            host.innerHTML = `<div style="color:var(--text-muted); font-size:0.85rem;">${T('LABEL_QUEUE_NO_MATCH')}</div>`;
            return;
        }
        const stock = STOCKS[format] || STOCKS.avery5161;
        const html = buildLabelSheetHtml(entities, format, opts);
        const zoom = stock.kind === 'sheet' ? 0.3 : stock.w < 40 ? 2.2 : 1;
        host.innerHTML = `<div class="sheet-mode" style="zoom:${zoom}; flex:0 0 auto;">${html}</div>`;
        const inner = host.querySelector<HTMLElement>('.sheet-mode');
        if (inner) await drawAllQrsInContainer(inner);
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
                            ${(['avery5161', 'avery5163', 'avery5366', 'brady', 'genericA', 'genericB', 'genericC', 'calTag', 'calTagSheet'] as LabelFormat[]).map(k => `<option value="${k}">${esc(STOCKS[k].brand)} ${esc(STOCKS[k].pn)} — ${esc(STOCKS[k].info)}</option>`).join('')}
                        </select>
                    </div>

                    <div style="background:#e2e8f0; padding:20px; border-radius:8px; margin-top:14px; min-height:140px; display:flex; justify-content:center; align-items:center;" id="labelPreviewContainer"></div>

                    <div class="form-row" style="margin-top:14px;">
                        <div class="form-group" style="text-align:left;">
                            <label>${T('Copies to Print:')}</label>
                            <input type="number" id="labelCopiesInput" class="form-control" value="1" min="1" max="100">
                        </div>
                    </div>
                    ${labelLayoutControlsHtml('label')}
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

        overlay.querySelector('#modalPrintQueueBtn')?.addEventListener('click', () => {
            this.closeToolLabel();
            this.openQueue();
        });

        const formatSelect = overlay.querySelector<HTMLSelectElement>('#labelFormatSelect');
        if (formatSelect) {
            formatSelect.addEventListener('change', async () => {
                this.selectedFormat = formatSelect.value as LabelFormat;
                this.refreshToolLayout?.();
            });
        }
        const refreshPreview = () => {
            const tool = this.currentToolId ? Store.getTool(this.currentToolId) : null;
            if (tool) void this.updatePreview(tool);
        };
        this.refreshToolLayout = bindLabelLayoutControls(overlay, 'label', () => this.selectedFormat, refreshPreview);
        overlay.querySelector('#labelCopiesInput')?.addEventListener('input', refreshPreview);

        overlay.querySelector('#printModalExecuteBtn')?.addEventListener('click', () => this.executePrint());
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
            Array.from({ length: this.readCopies() }, () => ({ id: tool.id, type: 'tool' as const })),
            this.selectedFormat,
            readLabelLayoutControls(document, 'label', this.selectedFormat)
        );

        // Sheet stock is a full Letter page (~1056px tall at 96dpi) — shrink it to
        // fit the modal; roll / single stock is shown close to 1:1.
        const zoom = stock.kind === 'sheet' ? 0.3 : stock.w < 40 ? 2.2 : 1;
        container.innerHTML = `<div class="sheet-mode" style="zoom:${zoom}; flex:0 0 auto;">${html}</div>`;
        const inner = container.querySelector<HTMLElement>('.sheet-mode');
        if (inner) await drawAllQrsInContainer(inner);
    }

    private static readCopies(): number {
        const n = Number((document.getElementById('labelCopiesInput') as HTMLInputElement | null)?.value);
        return Number.isFinite(n) ? Math.max(1, Math.min(100, Math.trunc(n))) : 1;
    }

    private static async executePrint(): Promise<void> {
        if (!this.currentToolId || !Store.getTool(this.currentToolId)) return;
        const copies = this.readCopies();
        const entities = Array.from({ length: copies }, () => ({ id: this.currentToolId!, type: 'tool' as const }));
        const button = document.getElementById('printModalExecuteBtn') as HTMLButtonElement;
        button.disabled = true;
        try {
            await printLabelsHtml(entities, this.selectedFormat, readLabelLayoutControls(document, 'label', this.selectedFormat));
            toast(`${T('LABELS_PRINTED')} ${copies}`, 'success');
            this.closeToolLabel();
        } catch (error) {
            toast(`${T('LABEL_PRINT_FAILED')} ${esc((error as Error).message)}`, 'danger');
        } finally { button.disabled = false; }
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

                    <div class="form-group"><label>${T('Select Label Stock / Format:')}</label>
                      <select id="locFormatSelect" class="form-control">${(['avery5161', 'avery5163', 'avery5366'] as LabelFormat[]).map(k => `<option value="${k}">${esc(STOCKS[k].brand)} ${esc(STOCKS[k].pn)}</option>`).join('')}</select></div>
                    ${labelLayoutControlsHtml('loc')}
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

        const refreshLayout = bindLabelLayoutControls(overlay, 'loc', () => (overlay.querySelector('#locFormatSelect') as HTMLSelectElement).value as LabelFormat, () => { void this.updateLocationPreview(); });
        overlay.querySelector('#locFormatSelect')?.addEventListener('change', refreshLayout);
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
        const format = (document.getElementById('locFormatSelect') as HTMLSelectElement).value as LabelFormat;
        card.innerHTML = `<div class="sheet-mode" style="zoom:0.3;flex:0 0 auto;">${buildLabelSheetHtml([this.locationEntity()], format, readLabelLayoutControls(document, 'loc', format))}</div>`;
        await drawAllQrsInContainer(card);
    }

    private static locationEntity(): LabelEntity {
        const value = (id: string, fallback: string) => (document.getElementById(id) as HTMLInputElement | null)?.value.trim() || fallback;
        return { id: `LOC:${value('locTypeSelect', 'rack')}:${value('locZoneSelect', '')}:${value('locRackInput', 'A')}:${value('locShelfInput', '1')}:${value('locBinInput', '1')}:${value('locRespInput', 'Plant Operations')}`, type: 'location' };
    }

    private static async executeLocationPrint(): Promise<void> {
        const button = document.getElementById('locModalPrintBtn') as HTMLButtonElement;
        const format = (document.getElementById('locFormatSelect') as HTMLSelectElement).value as LabelFormat;
        button.disabled = true;
        try {
            await printLabelsHtml([this.locationEntity()], format, readLabelLayoutControls(document, 'loc', format));
            this.closeLocationLabels();
        } catch (error) {
            toast(`${T('LABEL_PRINT_FAILED')} ${esc((error as Error).message)}`, 'danger');
        } finally { button.disabled = false; }
    }
}
