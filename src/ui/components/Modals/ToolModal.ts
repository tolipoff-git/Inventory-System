// ============================================================================
// 5S Tool Command Center — ToolModal Component (Add & Edit Tools)
// ============================================================================

import { T, getLanguage } from '../../../i18n';
import { Store } from '../../../storage/store';
import { CONFIG } from '../../../config/constants';
import { esc, nowISO } from '../../../utils/formatters';
import { Tool } from '../../../types/inventory';
import { suggestToolId, calDueFrom } from '../../../operations/toolOps';
import { toast } from '../../../utils/dom';

export class ToolModal {
    private static addModalId = 'addToolModal';
    private static editModalId = 'editToolModal';
    private static editingToolId: string | null = null;

    public static openAdd(): void {
        let modal = document.getElementById(this.addModalId);
        if (!modal) {
            this.createAddModalDOM();
            modal = document.getElementById(this.addModalId);
        }
        this.resetAddForm();
        if (modal) modal.classList.add('active');
    }

    public static openEdit(toolId: string): void {
        this.editingToolId = toolId;
        const tool = Store.getTool(toolId);
        if (!tool) return;

        let modal = document.getElementById(this.editModalId);
        if (!modal) {
            this.createEditModalDOM();
            modal = document.getElementById(this.editModalId);
        }
        this.populateEditForm(tool);
        if (modal) modal.classList.add('active');
    }

    public static closeAdd(): void {
        const modal = document.getElementById(this.addModalId);
        if (modal) modal.classList.remove('active');
    }

    public static closeEdit(): void {
        const modal = document.getElementById(this.editModalId);
        if (modal) modal.classList.remove('active');
        this.editingToolId = null;
    }

    private static createAddModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.addModalId;

        overlay.innerHTML = `
            <div class="modal wide" style="max-width:680px;">
                <div class="modal-header">
                    <h3 class="modal-title">+ ${T('Add New Tool')}</h3>
                    <button class="close-btn" id="addToolCloseBtn">&times;</button>
                </div>
                <div class="modal-body" style="max-height:75vh; overflow-y:auto;">
                    <div class="form-row">
                        <div class="form-group">
                            <label>${T('Type')}:</label>
                            <select id="addToolType" class="form-control">
                                <option value="Permanent">${T('Permanent')}</option>
                                <option value="Consumable">${T('Consumables')}</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>${T('Tool Class')}:</label>
                            <select id="addToolClass" class="form-control"></select>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label>${T('Inventory Number (ID)')}: *</label>
                            <input type="text" id="addToolId" class="form-control" placeholder="e.g. TW-006" style="font-family:monospace; letter-spacing:1px; font-weight:bold;">
                            <small style="color:var(--text-muted); font-size:0.75rem;">${T('ID_HINT')}</small>
                        </div>
                        <div class="form-group">
                            <label>${T('Tool Name')}: *</label>
                            <input type="text" id="addToolName" class="form-control" placeholder="e.g. 1/2 Torque Wrench">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label>${T('Category')}:</label>
                            <input type="text" id="addToolCategory" class="form-control" list="addCatList" placeholder="e.g. Torque Wrenches">
                            <datalist id="addCatList"></datalist>
                        </div>
                        <div class="form-group">
                            <label>${T('Specification')}:</label>
                            <input type="text" id="addToolSpec" class="form-control" placeholder="e.g. 20-100 Nm, ±4%">
                        </div>
                        <div class="form-group">
                            <label>${T('Program')}:</label>
                            <select id="addToolProgram" class="form-control"></select>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label>${T('Serial Number')}:</label>
                            <input type="text" id="addToolSn" class="form-control" placeholder="SN or auto">
                        </div>
                        <div class="form-group">
                            <label>${T('Article / Part #')}:</label>
                            <input type="text" id="addToolArticle" class="form-control" placeholder="Part #">
                        </div>
                        <div class="form-group">
                            <label>${T('Quantity')}:</label>
                            <input type="number" id="addToolQty" class="form-control" value="1" min="1">
                        </div>
                    </div>

                    <fieldset style="border:1px solid var(--border); border-radius:6px; padding:12px; margin-bottom:12px;">
                        <legend style="color:var(--primary-hover); font-weight:bold; padding:0 6px;">📍 ${T('Address Storage & Workstation')}</legend>
                        <div class="form-row">
                            <div class="form-group">
                                <label>${T('Workstation')}:</label>
                                <select id="addToolWs" class="form-control"></select>
                            </div>
                            <div class="form-group">
                                <label>${T('Workpost')}:</label>
                                <select id="addToolPost" class="form-control"></select>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>${T('Rack')}:</label>
                                <select id="addToolRack" class="form-control"></select>
                            </div>
                            <div class="form-group">
                                <label>${T('Shelf')}:</label>
                                <select id="addToolShelf" class="form-control"></select>
                            </div>
                            <div class="form-group">
                                <label>${T('Bin')}:</label>
                                <select id="addToolBin" class="form-control"></select>
                            </div>
                        </div>
                    </fieldset>

                    <div class="form-row">
                        <div class="form-group">
                            <label>${T('Calibration Interval (Days)')}:</label>
                            <input type="number" id="addToolInterval" class="form-control" min="0" value="0">
                        </div>
                        <div class="form-group">
                            <label>${T('Calibration Due Date')}:</label>
                            <input type="date" id="addToolCalDue" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>${T('Min Qty Alert')}:</label>
                            <input type="number" id="addToolMinQty" class="form-control" value="0" min="0">
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="addToolCancelBtn">${T('Cancel')}</button>
                    <button class="btn btn-success" id="addToolSubmitBtn">${T('Save Tool')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#addToolCloseBtn')?.addEventListener('click', () => this.closeAdd());
        overlay.querySelector('#addToolCancelBtn')?.addEventListener('click', () => this.closeAdd());
        overlay.querySelector('#addToolSubmitBtn')?.addEventListener('click', () => this.submitAdd());

        const wsSelect = overlay.querySelector<HTMLSelectElement>('#addToolWs');
        if (wsSelect) {
            wsSelect.addEventListener('change', () => {
                this.updatePostSelect(wsSelect.value, 'addToolPost');
            });
        }

        // Type drives which classes are offered; the class drives the auto ID and
        // the default category (monolith parity: `Ops.onToolClassChange`).
        const typeSelect = overlay.querySelector<HTMLSelectElement>('#addToolType');
        typeSelect?.addEventListener('change', () => {
            this.populateClassSelect(typeSelect.value as 'Permanent' | 'Consumable');
            this.applyClassDefaults();
        });
        overlay.querySelector('#addToolClass')?.addEventListener('change', () => this.applyClassDefaults());
    }

    private static createEditModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.editModalId;

        overlay.innerHTML = `
            <div class="modal wide" style="max-width:680px;">
                <div class="modal-header">
                    <h3 class="modal-title">✏️ ${T('Edit Tool')}</h3>
                    <button class="close-btn" id="editToolCloseBtn">&times;</button>
                </div>
                <div class="modal-body" style="max-height:75vh; overflow-y:auto;">
                    <div class="form-row">
                        <div class="form-group">
                            <label>${T('Tool ID')}:</label>
                            <input type="text" id="editToolId" class="form-control" disabled>
                        </div>
                        <div class="form-group">
                            <label>${T('Tool Name')}: *</label>
                            <input type="text" id="editToolName" class="form-control">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label>${T('Category')}:</label>
                            <input type="text" id="editToolCategory" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>${T('Specification')}:</label>
                            <input type="text" id="editToolSpec" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>${T('Program')}:</label>
                            <select id="editToolProgram" class="form-control"></select>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label>${T('Serial Number')}:</label>
                            <input type="text" id="editToolSn" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>${T('Article / Part #')}:</label>
                            <input type="text" id="editToolArticle" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>${T('Quantity')}:</label>
                            <input type="number" id="editToolQty" class="form-control" min="1">
                        </div>
                    </div>

                    <fieldset style="border:1px solid var(--border); border-radius:6px; padding:12px; margin-bottom:12px;">
                        <legend style="color:var(--primary-hover); font-weight:bold; padding:0 6px;">📍 ${T('Address Storage & Workstation')}</legend>
                        <div class="form-row">
                            <div class="form-group">
                                <label>${T('Workstation')}:</label>
                                <select id="editToolWs" class="form-control"></select>
                            </div>
                            <div class="form-group">
                                <label>${T('Workpost')}:</label>
                                <select id="editToolPost" class="form-control"></select>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>${T('Rack')}:</label>
                                <select id="editToolRack" class="form-control"></select>
                            </div>
                            <div class="form-group">
                                <label>${T('Shelf')}:</label>
                                <select id="editToolShelf" class="form-control"></select>
                            </div>
                            <div class="form-group">
                                <label>${T('Bin')}:</label>
                                <select id="editToolBin" class="form-control"></select>
                            </div>
                        </div>
                    </fieldset>

                    <div class="form-row">
                        <div class="form-group">
                            <label>${T('Calibration Interval (Days)')}:</label>
                            <input type="number" id="editToolInterval" class="form-control" min="0">
                        </div>
                        <div class="form-group">
                            <label>${T('Calibration Due Date')}:</label>
                            <input type="date" id="editToolCalDue" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>${T('Min Qty Alert')}:</label>
                            <input type="number" id="editToolMinQty" class="form-control" min="0">
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="editToolCancelBtn">${T('Cancel')}</button>
                    <button class="btn btn-success" id="editToolSubmitBtn">${T('Save Changes')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#editToolCloseBtn')?.addEventListener('click', () => this.closeEdit());
        overlay.querySelector('#editToolCancelBtn')?.addEventListener('click', () => this.closeEdit());
        overlay.querySelector('#editToolSubmitBtn')?.addEventListener('click', () => this.submitEdit());

        const wsSelect = overlay.querySelector<HTMLSelectElement>('#editToolWs');
        if (wsSelect) {
            wsSelect.addEventListener('change', () => {
                this.updatePostSelect(wsSelect.value, 'editToolPost');
            });
        }
    }

    private static populateDropdowns(prefix: 'addTool' | 'editTool'): void {
        const wsSelect = document.getElementById(`${prefix}Ws`) as HTMLSelectElement;
        const rackSelect = document.getElementById(`${prefix}Rack`) as HTMLSelectElement;
        const shelfSelect = document.getElementById(`${prefix}Shelf`) as HTMLSelectElement;
        const binSelect = document.getElementById(`${prefix}Bin`) as HTMLSelectElement;
        const progSelect = document.getElementById(`${prefix}Program`) as HTMLSelectElement;

        if (progSelect) {
            // Per-tool program (v94). Read by ChartsView/DetailModal; previously had
            // no writer anywhere, so the field was permanently unsettable.
            progSelect.innerHTML = '<option value="">- Select -</option>' +
                Store.programs.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
        }

        if (wsSelect) {
            wsSelect.innerHTML = Store.workstations.map(ws => `<option value="${esc(ws)}">${esc(ws)}</option>`).join('');
            this.updatePostSelect(wsSelect.value, `${prefix}Post`);
        }

        if (rackSelect) {
            let html = '<option value="">- Select -</option>';
            for (let i = 0; i < 26; i++) {
                const letter = String.fromCharCode(65 + i);
                html += `<option value="Rack ${letter}">Rack ${letter}</option>`;
            }
            rackSelect.innerHTML = html;
        }

        if (shelfSelect) {
            let html = '<option value="">- Select -</option>';
            for (let i = 1; i <= 20; i++) {
                html += `<option value="Shelf ${i}">Shelf ${i}</option>`;
            }
            shelfSelect.innerHTML = html;
        }

        if (binSelect) {
            let html = '<option value="">- Select -</option>';
            for (let i = 1; i <= 50; i++) {
                html += `<option value="Bin ${i}">Bin ${i}</option>`;
            }
            binSelect.innerHTML = html;
        }

        // Category datalist
        const catList = document.getElementById('addCatList');
        if (catList) {
            const cats = [...new Set(Store.tools.map(t => t.category).filter(Boolean))];
            catList.innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');
        }
    }

    private static updatePostSelect(ws: string, postId: string): void {
        const postSelect = document.getElementById(postId) as HTMLSelectElement;
        if (!postSelect) return;
        const posts = Store.postsForZone(ws);
        postSelect.innerHTML = posts.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    }

    /**
     * Fill the Tool Class select for the chosen type (Permanent → non-CONS classes,
     * Consumable → CONS classes), localised. Restores the monolith's class picker.
     */
    private static populateClassSelect(type: 'Permanent' | 'Consumable' = 'Permanent'): void {
        const sel = document.getElementById('addToolClass') as HTMLSelectElement | null;
        if (!sel) return;
        const wantCons = type === 'Consumable';
        const lang = getLanguage();
        const classes = CONFIG.TOOL_CLASSES.filter(c => (c.group === 'CONS') === wantCons);
        sel.innerHTML = classes
            .map(c => `<option value="${esc(c.p)}">${esc(c.p)} — ${esc(lang === 'RU' ? c.ru : c.en)}</option>`)
            .join('');
    }

    /**
     * Auto-fill the inventory number (next free `CLASS-NNN`) and the default
     * category from the selected class — the monolith's `Ops.onToolClassChange()`.
     */
    private static applyClassDefaults(): void {
        const sel = document.getElementById('addToolClass') as HTMLSelectElement | null;
        if (!sel) return;
        const cls = CONFIG.TOOL_CLASSES.find(c => c.p === sel.value);
        if (!cls) return;
        const idEl = document.getElementById('addToolId') as HTMLInputElement | null;
        if (idEl) idEl.value = suggestToolId(cls.p);
        const catEl = document.getElementById('addToolCategory') as HTMLInputElement | null;
        if (catEl) catEl.value = cls.cat;
    }

    private static resetAddForm(): void {
        this.populateDropdowns('addTool');
        const typeSel = document.getElementById('addToolType') as HTMLSelectElement | null;
        if (typeSel) typeSel.value = 'Permanent';
        // Class → auto ID + default category (sets addToolId / addToolCategory).
        this.populateClassSelect('Permanent');
        this.applyClassDefaults();
        (document.getElementById('addToolName') as HTMLInputElement).value = '';
        (document.getElementById('addToolSpec') as HTMLInputElement).value = '';
        (document.getElementById('addToolSn') as HTMLInputElement).value = '';
        (document.getElementById('addToolArticle') as HTMLInputElement).value = '';
        (document.getElementById('addToolQty') as HTMLInputElement).value = '1';
        (document.getElementById('addToolInterval') as HTMLInputElement).value = '0';
        (document.getElementById('addToolCalDue') as HTMLInputElement).value = '';
        (document.getElementById('addToolMinQty') as HTMLInputElement).value = '0';
    }

    private static populateEditForm(tool: Tool): void {
        this.populateDropdowns('editTool');
        (document.getElementById('editToolId') as HTMLInputElement).value = tool.id;
        (document.getElementById('editToolName') as HTMLInputElement).value = tool.name;
        (document.getElementById('editToolCategory') as HTMLInputElement).value = tool.category || '';
        (document.getElementById('editToolSpec') as HTMLInputElement).value = tool.spec || '';
        (document.getElementById('editToolProgram') as HTMLSelectElement).value = tool.program || '';
        (document.getElementById('editToolSn') as HTMLInputElement).value = tool.sn || '';
        (document.getElementById('editToolArticle') as HTMLInputElement).value = tool.article || '';
        (document.getElementById('editToolQty') as HTMLInputElement).value = String(tool.qty || 1);
        (document.getElementById('editToolCalDue') as HTMLInputElement).value = tool.calDue || '';
        (document.getElementById('editToolInterval') as HTMLInputElement).value = tool.calIntervalDays ? String(tool.calIntervalDays) : '0';
        (document.getElementById('editToolMinQty') as HTMLInputElement).value = String(tool.minQty || 0);

        const wsSelect = document.getElementById('editToolWs') as HTMLSelectElement;
        const postSelect = document.getElementById('editToolPost') as HTMLSelectElement;
        const rackSelect = document.getElementById('editToolRack') as HTMLSelectElement;
        const shelfSelect = document.getElementById('editToolShelf') as HTMLSelectElement;
        const binSelect = document.getElementById('editToolBin') as HTMLSelectElement;

        const wsp = Store.workstationAndPostOf(tool);
        if (wsSelect && wsp.ws) wsSelect.value = wsp.ws;
        this.updatePostSelect(wsSelect.value, 'editToolPost');
        if (postSelect && wsp.post) postSelect.value = wsp.post;

        if (tool.address) {
            if (rackSelect && tool.address.rack) rackSelect.value = tool.address.rack;
            if (shelfSelect && tool.address.shelf) shelfSelect.value = tool.address.shelf;
            if (binSelect && tool.address.bin) binSelect.value = tool.address.bin;
        }
    }

    private static async submitAdd(): Promise<void> {
        const id = (document.getElementById('addToolId') as HTMLInputElement).value.trim().toUpperCase();
        const name = (document.getElementById('addToolName') as HTMLInputElement).value.trim();
        const category = (document.getElementById('addToolCategory') as HTMLInputElement).value.trim() || 'General';
        const spec = (document.getElementById('addToolSpec') as HTMLInputElement).value.trim() || 'N/A';
        const program = (document.getElementById('addToolProgram') as HTMLSelectElement).value;
        const sn = (document.getElementById('addToolSn') as HTMLInputElement).value.trim();
        const article = (document.getElementById('addToolArticle') as HTMLInputElement).value.trim();
        const qty = parseInt((document.getElementById('addToolQty') as HTMLInputElement).value) || 1;
        const calDueManual = (document.getElementById('addToolCalDue') as HTMLInputElement).value;
        const intervalDays = parseInt((document.getElementById('addToolInterval') as HTMLInputElement).value) || 0;
        const minQty = parseInt((document.getElementById('addToolMinQty') as HTMLInputElement).value) || 0;

        const ws = (document.getElementById('addToolWs') as HTMLSelectElement).value;
        const post = (document.getElementById('addToolPost') as HTMLSelectElement).value;
        const rack = (document.getElementById('addToolRack') as HTMLSelectElement).value;
        const shelf = (document.getElementById('addToolShelf') as HTMLSelectElement).value;
        const bin = (document.getElementById('addToolBin') as HTMLSelectElement).value;

        if (!id || !name) {
            toast(T('TOOL_ID_NAME_REQUIRED'), 'danger');
            return;
        }

        // Monolith parity: enforce the CLASS-NNN id shape (e.g. TW-006).
        if (!/^[A-Z]{2,3}-\d{3,5}$/.test(id)) {
            toast(T('ID_BAD_FORMAT'), 'danger');
            return;
        }

        if (Store.getTool(id)) {
            toast(`${T('TOOL_EXISTS')} ${id}`, 'danger');
            return;
        }

        // Type comes from the explicit select (monolith parity); fall back to the
        // ID prefix only if the select is somehow absent.
        const typeVal = (document.getElementById('addToolType') as HTMLSelectElement | null)?.value;
        const type: 'Permanent' | 'Consumable' = typeVal
            ? (typeVal === 'Consumable' ? 'Consumable' : 'Permanent')
            : (CONFIG.CONSUMABLE_PREFIXES.some(p => id.startsWith(p)) ? 'Consumable' : 'Permanent');

        // Next due = explicit date, else today + interval.
        const calDue = calDueManual || (intervalDays > 0 ? calDueFrom(nowISO().split('T')[0], intervalDays) : '');

        const newTool: Tool = {
            id,
            name,
            category,
            spec,
            program: program || undefined,
            // Monolith parity: `CLASS-XXXXXXXX`, which `isAutoSn()` recognises as auto.
            sn: sn || `${(id.includes('-') ? id.split('-')[0] : 'SN')}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
            article,
            qty,
            status: 'Active',
            location: post ? `${ws} / ${post}` : ws,
            address: {
                zone: ws,
                rack,
                shelf,
                bin
            },
            type,
            calDue: calDue || undefined,
            calIntervalDays: intervalDays > 0 ? intervalDays : undefined,
            minQty: minQty || undefined,
            commissioned_date: nowISO().split('T')[0],
            history: [`${nowISO().split('T')[0]} | Commissioned into service at ${ws}`]
        };

        await Store.saveTool(newTool);
        toast(`${T('TOOL_ADDED')} ${id}`, 'success');
        this.closeAdd();
    }

    private static async submitEdit(): Promise<void> {
        if (!this.editingToolId) return;
        const tool = Store.getTool(this.editingToolId);
        if (!tool) return;

        const name = (document.getElementById('editToolName') as HTMLInputElement).value.trim();
        const category = (document.getElementById('editToolCategory') as HTMLInputElement).value.trim() || 'General';
        const spec = (document.getElementById('editToolSpec') as HTMLInputElement).value.trim() || 'N/A';
        const program = (document.getElementById('editToolProgram') as HTMLSelectElement).value;
        const sn = (document.getElementById('editToolSn') as HTMLInputElement).value.trim();
        const article = (document.getElementById('editToolArticle') as HTMLInputElement).value.trim();
        const qty = parseInt((document.getElementById('editToolQty') as HTMLInputElement).value) || 1;
        const calDue = (document.getElementById('editToolCalDue') as HTMLInputElement).value;
        const intervalDays = parseInt((document.getElementById('editToolInterval') as HTMLInputElement).value) || 0;
        const minQty = parseInt((document.getElementById('editToolMinQty') as HTMLInputElement).value) || 0;

        const ws = (document.getElementById('editToolWs') as HTMLSelectElement).value;
        const post = (document.getElementById('editToolPost') as HTMLSelectElement).value;
        const rack = (document.getElementById('editToolRack') as HTMLSelectElement).value;
        const shelf = (document.getElementById('editToolShelf') as HTMLSelectElement).value;
        const bin = (document.getElementById('editToolBin') as HTMLSelectElement).value;

        if (!name) {
            toast(T('TOOL_NAME_REQUIRED'), 'danger');
            return;
        }

        tool.name = name;
        tool.category = category;
        tool.spec = spec;
        tool.program = program || undefined;
        tool.sn = sn || tool.sn;
        tool.article = article;
        tool.qty = qty;
        tool.calDue = calDue || undefined;
        tool.calIntervalDays = intervalDays > 0 ? intervalDays : undefined;
        tool.minQty = minQty || undefined;
        tool.location = post ? `${ws} / ${post}` : ws;
        tool.address = {
            zone: ws,
            rack,
            shelf,
            bin
        };

        if (!tool.history) tool.history = [];
        tool.history.push(`${nowISO().split('T')[0]} | Tool specs & location updated by admin`);

        await Store.saveTool(tool);
        toast(`${T('TOOL_UPDATED')} ${tool.id}`, 'success');
        this.closeEdit();
    }
}
