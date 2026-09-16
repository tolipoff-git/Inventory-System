// ============================================================================
// 5S Tool Command Center — LabelModal Component (Print Labels & Previews)
// ============================================================================

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { esc } from '../../../utils/formatters';
import { generateQrDataUrl } from '../../../labels/qrGenerator';
import { printLabelsHtml, printQueueLabels, LabelFormat } from '../../../labels/labelPrint';
import { toast, printHtml } from '../../../utils/dom';

export class LabelModal {
    private static printModalId = 'printLabelModal';
    private static locModalId = 'locationLabelModal';
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
                        </select>
                    </div>

                    <div style="background:#e2e8f0; padding:20px; border-radius:8px; margin-top:14px; min-height:140px; display:flex; justify-content:center; align-items:center;" id="labelPreviewContainer"></div>

                    <div class="form-row" style="margin-top:14px;">
                        <div class="form-group" style="text-align:left;">
                            <label>${T('Copies to Print:')}</label>
                            <input type="number" id="labelCopiesInput" class="form-control" value="1" min="1" max="100">
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
            await printQueueLabels(this.selectedFormat);
            this.closeToolLabel();
        });

        const formatSelect = overlay.querySelector<HTMLSelectElement>('#labelFormatSelect');
        if (formatSelect) {
            formatSelect.addEventListener('change', async () => {
                this.selectedFormat = formatSelect.value as LabelFormat;
                if (this.currentToolId) {
                    const tool = Store.getTool(this.currentToolId);
                    if (tool) await this.updatePreview(tool);
                }
            });
        }

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

    private static async updatePreview(tool: any): Promise<void> {
        const container = document.getElementById('labelPreviewContainer');
        if (!container) return;

        const qrUrl = await generateQrDataUrl(tool.id);
        const loc = tool.location || 'Main Store';
        const addr = tool.address ? `${tool.address.rack || ''} ${tool.address.shelf || ''}-${tool.address.bin || ''}`.trim() : '';

        container.innerHTML = `
            <div style="background:#ffffff; color:#000000; border:1px solid #94a3b8; border-radius:4px; padding:10px 14px; display:flex; align-items:center; gap:12px; width:340px; box-shadow:0 4px 12px rgba(0,0,0,0.15); font-family:var(--font-mono);">
                <img src="${qrUrl}" style="width:72px; height:72px; flex-shrink:0;">
                <div style="text-align:left; overflow:hidden; line-height:1.3;">
                    <div style="font-weight:bold; font-size:1.05rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(tool.id)}</div>
                    <div style="font-size:0.82rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(tool.name)}</div>
                    <div style="font-size:0.75rem; color:#475569;">${esc(loc)} ${addr ? '· ' + esc(addr) : ''}</div>
                    <div style="font-size:0.7rem; color:#64748b; margin-top:2px;">SN: ${esc(tool.sn || tool.serialNumber || 'N/A')}</div>
                </div>
            </div>
        `;
    }

    private static async executePrint(): Promise<void> {
        if (!this.currentToolId) return;
        const tool = Store.getTool(this.currentToolId);
        if (!tool) return;

        const copies = parseInt((document.getElementById('labelCopiesInput') as HTMLInputElement).value) || 1;
        const entities = Array.from({ length: copies }, () => ({ id: tool.id, type: 'tool' as const }));

        await printLabelsHtml(entities, this.selectedFormat);
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
                    <div style="font-weight:bold; font-size:1.05rem;">📍 ${esc(type)} ${esc(rack)}</div>
                    <div style="font-size:0.85rem;">${esc(zone)} · Sh ${esc(shelf)} · B ${esc(bin)}</div>
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
                        <div style="font-weight:bold; font-size:1.15rem;">📍 ${esc(type)} ${esc(rack)}</div>
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
