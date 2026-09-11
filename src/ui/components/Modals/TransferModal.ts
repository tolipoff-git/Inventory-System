// ============================================================================
// 5S Tool Command Center — TransferModal Component (Move Location)
// ============================================================================

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { transferTool } from '../../../operations/toolOps';
import { esc } from '../../../utils/formatters';
import { toast } from '../../../utils/dom';

export class TransferModal {
    private static modalId = 'transferModal';
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
            <div class="modal" style="max-width:520px;">
                <div class="modal-header">
                    <h3 class="modal-title" id="transTitle">${T('Transfer / Move Location')}</h3>
                    <button class="close-btn" id="transCloseBtn">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="font-size:0.95rem; margin-bottom:12px;" id="transToolInfo"></div>

                    <div class="form-row">
                        <div class="form-group">
                            <label>${T('Destination Workstation:')} *</label>
                            <select id="transWsSelect" class="form-control"></select>
                        </div>
                        <div class="form-group">
                            <label>${T('Workpost:')}</label>
                            <select id="transPostSelect" class="form-control"></select>
                        </div>
                    </div>

                    <fieldset style="border:1px solid var(--border); border-radius:6px; padding:10px; margin-bottom:12px;">
                        <legend style="color:var(--primary-hover); font-size:0.88rem; font-weight:bold; padding:0 6px;">
                            ${T('Storage Address')}
                        </legend>
                        <div class="form-row">
                            <div class="form-group">
                                <label>${T('Rack')}:</label>
                                <select id="transRackSelect" class="form-control"></select>
                            </div>
                            <div class="form-group">
                                <label>${T('Shelf')}:</label>
                                <select id="transShelfSelect" class="form-control"></select>
                            </div>
                            <div class="form-group">
                                <label>${T('Bin')}:</label>
                                <select id="transBinSelect" class="form-control"></select>
                            </div>
                        </div>
                    </fieldset>

                    <div class="form-group">
                        <label>${T('Transfer Reason / Notes:')}</label>
                        <input type="text" id="transNotes" class="form-control" placeholder="e.g. Relocated to Sub-assembly line">
                    </div>
                </div>
                <div class="modal-footer spread">
                    <button class="btn btn-muted" id="transCancelBtn">${T('Cancel')}</button>
                    <button class="btn btn-success" id="transSubmitBtn">${T('Apply Transfer')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#transCloseBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#transCancelBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#transSubmitBtn')?.addEventListener('click', () => this.submit());

        const wsSelect = overlay.querySelector<HTMLSelectElement>('#transWsSelect');
        if (wsSelect) {
            wsSelect.addEventListener('change', () => {
                this.updatePostSelect(wsSelect.value);
            });
        }
    }

    private static populate(tool: any): void {
        const titleEl = document.getElementById('transTitle');
        const infoEl = document.getElementById('transToolInfo');
        const wsSelect = document.getElementById('transWsSelect') as HTMLSelectElement;
        const rackSelect = document.getElementById('transRackSelect') as HTMLSelectElement;
        const shelfSelect = document.getElementById('transShelfSelect') as HTMLSelectElement;
        const binSelect = document.getElementById('transBinSelect') as HTMLSelectElement;

        if (titleEl) titleEl.textContent = `${T('Transfer / Move Location')} — ${tool.id}`;
        if (infoEl) {
            infoEl.innerHTML = `<strong>${esc(tool.name)}</strong><br><span style="color:var(--text-muted);">${T('Current:')} ${esc(tool.location || 'N/A')}</span>`;
        }

        if (wsSelect) {
            wsSelect.innerHTML = Store.workstations.map(ws => `<option value="${esc(ws)}">${esc(ws)}</option>`).join('');
            const wsp = Store.workstationAndPostOf(tool);
            if (wsp.ws) wsSelect.value = wsp.ws;
            this.updatePostSelect(wsSelect.value, wsp.post);
        }

        if (rackSelect) {
            let html = '<option value="">- Select -</option>';
            for (let i = 0; i < 26; i++) {
                const letter = String.fromCharCode(65 + i);
                html += `<option value="Rack ${letter}">Rack ${letter}</option>`;
            }
            rackSelect.innerHTML = html;
            if (tool.address && tool.address.rack) rackSelect.value = tool.address.rack;
        }

        if (shelfSelect) {
            let html = '<option value="">- Select -</option>';
            for (let i = 1; i <= 20; i++) html += `<option value="Shelf ${i}">Shelf ${i}</option>`;
            shelfSelect.innerHTML = html;
            if (tool.address && tool.address.shelf) shelfSelect.value = tool.address.shelf;
        }

        if (binSelect) {
            let html = '<option value="">- Select -</option>';
            for (let i = 1; i <= 50; i++) html += `<option value="Bin ${i}">Bin ${i}</option>`;
            binSelect.innerHTML = html;
            if (tool.address && tool.address.bin) binSelect.value = tool.address.bin;
        }

        (document.getElementById('transNotes') as HTMLInputElement).value = '';
    }

    private static updatePostSelect(ws: string, selectedPost?: string): void {
        const postSelect = document.getElementById('transPostSelect') as HTMLSelectElement;
        if (!postSelect) return;
        const posts = Store.postsForZone(ws);
        postSelect.innerHTML = `<option value="">-- Main Station --</option>` +
            posts.map(p => `<option value="${esc(p)}" ${selectedPost === p ? 'selected' : ''}>${esc(p)}</option>`).join('');
    }

    private static async submit(): Promise<void> {
        if (!this.currentToolId) return;
        const ws = (document.getElementById('transWsSelect') as HTMLSelectElement).value;
        const post = (document.getElementById('transPostSelect') as HTMLSelectElement).value;
        const rack = (document.getElementById('transRackSelect') as HTMLSelectElement).value;
        const shelf = (document.getElementById('transShelfSelect') as HTMLSelectElement).value;
        const bin = (document.getElementById('transBinSelect') as HTMLSelectElement).value;
        const notes = (document.getElementById('transNotes') as HTMLInputElement).value.trim();

        if (!ws) {
            toast('Destination workstation is required.', 'warning');
            return;
        }

        try {
            await transferTool(
                this.currentToolId,
                ws,
                post || '',
                { zone: ws, rack, shelf, bin },
                notes || ''
            );
            toast(`Tool ${this.currentToolId} transferred to ${ws}!`, 'success');
            this.close();
        } catch (e: any) {
            toast(`Transfer failed: ${e.message}`, 'danger');
        }
    }
}
