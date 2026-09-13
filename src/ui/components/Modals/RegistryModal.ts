// ============================================================================
// 5S Tool Command Center — RegistryModal Component (System Registries & RBAC)
// ============================================================================

import { T } from '../../../i18n';
import { Store } from '../../../storage/store';
import { esc } from '../../../utils/formatters';
import { hashSecret } from '../../../utils/crypto';
import { toast } from '../../../utils/dom';
import { windowConfirm } from '../../../utils/dialogCompat';
import { UserRole } from '../../../types/personnel';

export class RegistryModal {
    private static modalId = 'registryModal';
    private static regEditModalId = 'regEditModal';
    private static currentTab = 'personnelTab';
    private static editingEmpId: string | null = null;
    private static regEditAction: { type: string; id: string; ws?: string } | null = null;

    public static open(tab?: string): void {
        let modal = document.getElementById(this.modalId);
        if (!modal) {
            this.createModalDOM();
            modal = document.getElementById(this.modalId);
        }

        if (tab) this.currentTab = tab;
        this.switchTab(this.currentTab);
        if (modal) modal.classList.add('active');
    }

    public static close(): void {
        const modal = document.getElementById(this.modalId);
        if (modal) modal.classList.remove('active');
        this.editingEmpId = null;
    }

    private static createModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.modalId;

        overlay.innerHTML = `
            <div class="modal wide" style="max-width:880px;">
                <div class="modal-header">
                    <h3 class="modal-title">⚙ ${T('System Registries')}</h3>
                    <button class="close-btn" id="regCloseBtn">&times;</button>
                </div>
                <div class="modal-body" style="max-height:75vh; overflow-y:auto;">
                    <div style="display:flex; gap:10px; margin-bottom:15px; border-bottom:1px solid var(--border); padding-bottom:10px; overflow-x:auto;">
                        <button class="btn" id="regTabBtn_personnel">${T('Personnel')}</button>
                        <button class="btn" id="regTabBtn_ws">${T('Programs & Stations')}</button>
                        <button class="btn" id="regTabBtn_wp">${T('Workposts')}</button>
                        <button class="btn" id="regTabBtn_rbac">${T('Users & RBAC')}</button>
                    </div>

                    <!-- Personnel Tab -->
                    <div id="regTabContent_personnel" class="reg-tab">
                        <div class="form-row" style="margin-bottom:12px;">
                            <input type="text" id="regEmpName" class="form-control" placeholder="Full Name">
                            <input type="text" id="regEmpInitials" class="form-control" placeholder="Initials" style="max-width:100px;">
                            <input type="text" id="regEmpBadge" class="form-control" placeholder="Badge/ID" style="max-width:120px;">
                            <select id="regEmpWs" class="form-control"></select>
                            <select id="regEmpPost" class="form-control"></select>
                            <button class="btn btn-success" id="regEmpSaveBtn">+ ${T('Add')}</button>
                            <button class="btn btn-muted" id="regEmpCancelBtn" style="display:none;">${T('Cancel')}</button>
                        </div>
                        <div class="table-scroll">
                            <table>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>${T('Name')}</th>
                                        <th>Initials</th>
                                        <th>Badge</th>
                                        <th>WS</th>
                                        <th>Post</th>
                                        <th>${T('Care Score')}</th>
                                        <th>${T('Actions')}</th>
                                    </tr>
                                </thead>
                                <tbody id="regEmpList"></tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Programs & Stations Tab -->
                    <div id="regTabContent_ws" class="reg-tab" style="display:none;">
                        <div class="form-row" style="margin-bottom:12px;">
                            <input type="text" id="regProgName" class="form-control" placeholder="${T('Program name (e.g. USS)')}">
                            <button class="btn btn-success" id="regProgAddBtn">+ ${T('Add Program')}</button>
                        </div>
                        <div style="color:var(--text-muted); font-size:0.85rem; margin-bottom:10px;">
                            ${T('STRUCTURE_HINT')}
                        </div>
                        <ul class="history-list" id="regWsList"></ul>
                    </div>

                    <!-- Workposts Tab -->
                    <div id="regTabContent_wp" class="reg-tab" style="display:none;">
                        <ul class="history-list" id="regWpList"></ul>
                    </div>

                    <!-- Users & RBAC Tab -->
                    <div id="regTabContent_rbac" class="reg-tab" style="display:none;">
                        <div class="form-row" style="margin-bottom:12px;">
                            <input type="text" id="regRbacUser" class="form-control" placeholder="Username">
                            <input type="password" id="regRbacPass" class="form-control" placeholder="Password">
                            <select id="regRbacRole" class="form-control">
                                <option value="Administrator">Administrator</option>
                                <option value="Tool Crib Manager">Tool Crib Manager</option>
                                <option value="Operator">Operator</option>
                            </select>
                            <button class="btn btn-success" id="regRbacAddBtn">+ ${T('Add User')}</button>
                        </div>
                        <div class="table-scroll">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Username</th>
                                        <th>${T('Role')}</th>
                                        <th>${T('Actions')}</th>
                                    </tr>
                                </thead>
                                <tbody id="regRbacList"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="regFooterCloseBtn">${T('Close')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#regCloseBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#regFooterCloseBtn')?.addEventListener('click', () => this.close());

        overlay.querySelector('#regTabBtn_personnel')?.addEventListener('click', () => this.switchTab('personnelTab'));
        overlay.querySelector('#regTabBtn_ws')?.addEventListener('click', () => this.switchTab('wsTab'));
        overlay.querySelector('#regTabBtn_wp')?.addEventListener('click', () => this.switchTab('wpTab'));
        overlay.querySelector('#regTabBtn_rbac')?.addEventListener('click', () => this.switchTab('rbacTab'));

        overlay.querySelector('#regEmpSaveBtn')?.addEventListener('click', () => this.saveEmp());
        overlay.querySelector('#regEmpCancelBtn')?.addEventListener('click', () => this.cancelEditEmp());
        overlay.querySelector('#regProgAddBtn')?.addEventListener('click', () => this.addProgram());
        overlay.querySelector('#regRbacAddBtn')?.addEventListener('click', () => this.addRbacUser());

        const wsSelect = overlay.querySelector<HTMLSelectElement>('#regEmpWs');
        if (wsSelect) {
            wsSelect.addEventListener('change', () => {
                this.updatePostSelect(wsSelect.value);
            });
        }

        this.createRegEditModalDOM();
    }

    private static createRegEditModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.regEditModalId;

        overlay.innerHTML = `
            <div class="modal narrow" style="max-width:440px;">
                <div class="modal-header">
                    <h3 class="modal-title" id="regEditTitle">Edit</h3>
                    <button class="close-btn" id="regEditCloseBtn">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group" id="regEditNameGroup">
                        <label>${T('New Name')}:</label>
                        <input type="text" id="regEditNameInput" class="form-control">
                    </div>
                    <div class="form-group" id="regEditZoneGroup" style="display:none;">
                        <label>${T('Target Zone / Workstation')}:</label>
                        <select id="regEditZoneSelect" class="form-control"></select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="regEditCancelBtn">${T('Cancel')}</button>
                    <button class="btn btn-success" id="regEditApplyBtn">${T('Apply')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#regEditCloseBtn')?.addEventListener('click', () => this.closeRegEdit());
        overlay.querySelector('#regEditCancelBtn')?.addEventListener('click', () => this.closeRegEdit());
        overlay.querySelector('#regEditApplyBtn')?.addEventListener('click', () => this.applyRegEdit());
    }

    public static switchTab(tab: string): void {
        this.currentTab = tab;
        const tabs = ['personnel', 'ws', 'wp', 'rbac'];
        tabs.forEach(t => {
            const content = document.getElementById(`regTabContent_${t}`);
            const btn = document.getElementById(`regTabBtn_${t}`);
            const isMatch = tab === `${t}Tab` || tab === t;
            if (content) content.style.display = isMatch ? 'block' : 'none';
            if (btn) btn.classList.toggle('active', isMatch);
        });

        if (tab.includes('personnel')) this.renderPersonnel();
        if (tab.includes('ws')) this.renderWs();
        if (tab.includes('wp')) this.renderWp();
        if (tab.includes('rbac')) this.renderRbac();
    }

    private static updatePostSelect(ws: string): void {
        const postSelect = document.getElementById('regEmpPost') as HTMLSelectElement;
        if (!postSelect) return;
        const posts = Store.postsForZone(ws);
        postSelect.innerHTML = `<option value="">-- Main Station --</option>` +
            posts.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    }

    // --- Personnel Tab ---
    private static renderPersonnel(): void {
        const tbody = document.getElementById('regEmpList');
        const wsSelect = document.getElementById('regEmpWs') as HTMLSelectElement;
        if (wsSelect) {
            wsSelect.innerHTML = Store.workstations.map(ws => `<option value="${esc(ws)}">${esc(ws)}</option>`).join('');
            this.updatePostSelect(wsSelect.value);
        }

        if (!tbody) return;
        tbody.innerHTML = Store.personnel.map(emp => {
            const careScore = emp.careScore ?? 100;
            const careColor = careScore >= 80 ? 'var(--success)' : careScore >= 60 ? 'var(--warning)' : 'var(--danger)';
            return `
            <tr>
                <td><strong>${esc(emp.id)}</strong></td>
                <td>${esc(emp.name)}</td>
                <td>${esc(emp.initials || '—')}</td>
                <td>${esc(emp.badge || '—')}</td>
                <td>${esc(emp.ws || 'Tool Gage')}</td>
                <td>${esc(emp.post || '—')}</td>
                <td><span style="background:${careColor}; color:#000; padding:2px 6px; border-radius:3px; font-weight:bold;">${careScore}%</span></td>
                <td>
                    <button class="btn" style="padding:2px 6px; font-size:0.75rem;" data-reg-action="edit-emp" data-id="${esc(emp.id)}">✏️</button>
                    <button class="btn btn-danger" style="padding:2px 6px; font-size:0.75rem;" data-reg-action="del-emp" data-id="${esc(emp.id)}">✖</button>
                </td>
            </tr>
            `;
        }).join('');

        tbody.querySelectorAll('[data-reg-action="edit-emp"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLElement).dataset.id!;
                this.editEmp(id);
            });
        });

        tbody.querySelectorAll('[data-reg-action="del-emp"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = (e.currentTarget as HTMLElement).dataset.id!;
                if (windowConfirm(`Remove employee ${id}?`)) {
                    Store.personnel = Store.personnel.filter(p => p.id !== id);
                    await Store.save();
                    this.renderPersonnel();
                }
            });
        });
    }

    private static editEmp(id: string): void {
        const emp = Store.getEmp(id);
        if (!emp) return;
        this.editingEmpId = id;

        (document.getElementById('regEmpName') as HTMLInputElement).value = emp.name;
        (document.getElementById('regEmpInitials') as HTMLInputElement).value = emp.initials || '';
        (document.getElementById('regEmpBadge') as HTMLInputElement).value = emp.badge || '';

        const wsSelect = document.getElementById('regEmpWs') as HTMLSelectElement;
        if (wsSelect && emp.ws) wsSelect.value = emp.ws;
        this.updatePostSelect(wsSelect ? wsSelect.value : '');

        const postSelect = document.getElementById('regEmpPost') as HTMLSelectElement;
        if (postSelect && emp.post) postSelect.value = emp.post;

        const saveBtn = document.getElementById('regEmpSaveBtn');
        const cancelBtn = document.getElementById('regEmpCancelBtn');
        if (saveBtn) saveBtn.textContent = T('Apply');
        if (cancelBtn) cancelBtn.style.display = 'inline-block';
    }

    private static cancelEditEmp(): void {
        this.editingEmpId = null;
        (document.getElementById('regEmpName') as HTMLInputElement).value = '';
        (document.getElementById('regEmpInitials') as HTMLInputElement).value = '';
        (document.getElementById('regEmpBadge') as HTMLInputElement).value = '';

        const saveBtn = document.getElementById('regEmpSaveBtn');
        const cancelBtn = document.getElementById('regEmpCancelBtn');
        if (saveBtn) saveBtn.textContent = '+ ' + T('Add');
        if (cancelBtn) cancelBtn.style.display = 'none';
    }

    private static async saveEmp(): Promise<void> {
        const name = (document.getElementById('regEmpName') as HTMLInputElement).value.trim();
        const initials = (document.getElementById('regEmpInitials') as HTMLInputElement).value.trim();
        const badge = (document.getElementById('regEmpBadge') as HTMLInputElement).value.trim();
        const ws = (document.getElementById('regEmpWs') as HTMLSelectElement).value;
        const post = (document.getElementById('regEmpPost') as HTMLSelectElement).value;

        if (!name) {
            toast('Employee name is required.', 'warning');
            return;
        }

        if (this.editingEmpId) {
            const emp = Store.getEmp(this.editingEmpId);
            if (emp) {
                emp.name = name;
                emp.initials = initials;
                emp.badge = badge;
                emp.ws = ws;
                emp.post = post;
                await Store.save();
                toast('Employee updated.', 'success');
            }
            this.cancelEditEmp();
        } else {
            const newId = 'EMP-' + Math.random().toString(36).substring(2, 6).toUpperCase();
            Store.personnel.push({
                id: newId,
                name,
                role: 'Operator',
                initials,
                badge,
                ws,
                post,
                careScore: 100,
                active: true
            });
            await Store.save();
            toast(`Employee ${name} added!`, 'success');
            this.cancelEditEmp();
        }

        this.renderPersonnel();
    }

    // --- Programs & Stations Tab ---
    private static renderWs(): void {
        const wsList = document.getElementById('regWsList');
        if (!wsList) return;

        const html = Store.programs.map(prog => {
            const stations = Store.wsOfProgram(prog);
            return `
            <li class="history-item" style="flex-direction:column; align-items:stretch; border-left:3px solid var(--primary); margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>🏭 <strong>${esc(prog)}</strong> (${stations.length})</span>
                    <div>
                        <button class="btn" style="padding:2px 6px; font-size:0.75rem;" data-reg-prog-rename="${esc(prog)}">✏️</button>
                        <button class="btn btn-danger" style="padding:2px 6px; font-size:0.75rem;" data-reg-prog-del="${esc(prog)}">✖</button>
                    </div>
                </div>
                <ul class="history-list" style="margin-top:6px; margin-left:14px;">
                    ${stations.map(ws => `
                        <li class="history-item" style="display:flex; justify-content:space-between; align-items:center;">
                            <span>📍 ${esc(ws)}</span>
                            <div>
                                <button class="btn" style="padding:2px 6px; font-size:0.75rem;" data-reg-ws-rename="${esc(ws)}">✏️</button>
                                <button class="btn btn-danger" style="padding:2px 6px; font-size:0.75rem;" data-reg-ws-del="${esc(ws)}">✖</button>
                            </div>
                        </li>
                    `).join('')}
                    <li style="display:flex; gap:6px; margin-top:4px;">
                        <input type="text" class="form-control" placeholder="${T('New station name')}" id="newWsInput_${esc(prog)}" style="font-size:0.85rem;">
                        <button class="btn btn-success" style="padding:4px 8px; font-size:0.85rem;" data-reg-ws-add="${esc(prog)}">+ ${T('Add')}</button>
                    </li>
                </ul>
            </li>
            `;
        }).join('');

        wsList.innerHTML = html;

        wsList.querySelectorAll('[data-reg-ws-add]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const prog = (e.currentTarget as HTMLElement).dataset.regWsAdd!;
                const input = (e.currentTarget as HTMLElement).closest('li')?.querySelector<HTMLInputElement>('input');
                if (input && input.value.trim()) {
                    const wsName = input.value.trim();
                    if (!Store.workstations.includes(wsName)) {
                        Store.workstations.push(wsName);
                        Store.setWsProgram(wsName, prog);
                        await Store.save();
                        toast(`Station ${wsName} added to ${prog}!`, 'success');
                        this.renderWs();
                    }
                }
            });
        });

        wsList.querySelectorAll('[data-reg-prog-rename]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const prog = (e.currentTarget as HTMLElement).dataset.regProgRename!;
                this.openRegEdit('programs', prog);
            });
        });

        wsList.querySelectorAll('[data-reg-prog-del]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const prog = (e.currentTarget as HTMLElement).dataset.regProgDel!;
                if (windowConfirm(`Delete program ${prog}?`)) {
                    Store.removeProgram(prog);
                    await Store.save();
                    toast(`Program ${prog} deleted!`, 'warning');
                    this.renderWs();
                }
            });
        });

        wsList.querySelectorAll('[data-reg-ws-rename]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const ws = (e.currentTarget as HTMLElement).dataset.regWsRename!;
                this.openRegEdit('workstations', ws);
            });
        });

        wsList.querySelectorAll('[data-reg-ws-del]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const ws = (e.currentTarget as HTMLElement).dataset.regWsDel!;
                if (windowConfirm(`Delete station ${ws}?`)) {
                    Store.workstations = Store.workstations.filter(w => w !== ws);
                    delete Store.wsProgram[ws];
                    await Store.save();
                    toast(`Station ${ws} deleted!`, 'warning');
                    this.renderWs();
                }
            });
        });
    }

    private static async addProgram(): Promise<void> {
        const input = document.getElementById('regProgName') as HTMLInputElement;
        if (!input || !input.value.trim()) return;
        const prog = input.value.trim();
        input.value = '';
        Store.addProgram(prog);
        await Store.save();
        toast(`Program ${prog} added!`, 'success');
        this.renderWs();
    }

    // --- Workposts Tab ---
    private static renderWp(): void {
        const wpList = document.getElementById('regWpList');
        if (!wpList) return;

        wpList.innerHTML = Store.workposts.map(p => `
            <li class="history-item" style="display:flex; justify-content:space-between; align-items:center;">
                <span>🛠 <strong>${esc(p.name)}</strong> <span style="color:var(--text-muted);">— ${esc(p.ws || 'No Zone')}</span></span>
                <div>
                    <button class="btn" style="padding:2px 6px; font-size:0.75rem;" data-reg-wp-rename="${esc(p.name)}" data-ws="${esc(p.ws || '')}">✏️</button>
                    <button class="btn btn-danger" style="padding:2px 6px; font-size:0.75rem;" data-reg-wp-del="${esc(p.name)}" data-ws="${esc(p.ws || '')}">✖</button>
                </div>
            </li>
        `).join('');

        wpList.querySelectorAll('[data-reg-wp-rename]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const name = (e.currentTarget as HTMLElement).dataset.regWpRename!;
                const ws = (e.currentTarget as HTMLElement).dataset.ws || '';
                this.openRegEdit('workposts', name, ws);
            });
        });

        wpList.querySelectorAll('[data-reg-wp-del]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const name = (e.currentTarget as HTMLElement).dataset.regWpDel!;
                const ws = (e.currentTarget as HTMLElement).dataset.ws || '';
                if (windowConfirm(`Delete post ${name}?`)) {
                    Store.workposts = Store.workposts.filter(p => !(p.name === name && p.ws === (ws || null)));
                    await Store.save();
                    this.renderWp();
                }
            });
        });
    }

    // --- Users & RBAC Tab ---
    private static renderRbac(): void {
        const tbody = document.getElementById('regRbacList');
        if (!tbody) return;

        tbody.innerHTML = Store.users.map(u => `
            <tr>
                <td><strong>${esc(u.username)}</strong></td>
                <td><span style="font-weight:bold; color:var(--primary-hover);">${esc(u.role)}</span></td>
                <td>
                    ${u.username !== 'admin' ? `
                        <button class="btn btn-danger" style="padding:2px 6px; font-size:0.75rem;" data-reg-user-del="${esc(u.username)}">✖</button>
                    ` : '<span style="color:var(--text-muted); font-size:0.8rem;">Protected</span>'}
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('[data-reg-user-del]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const user = (e.currentTarget as HTMLElement).dataset.regUserDel!;
                if (windowConfirm(`Remove user ${user}?`)) {
                    Store.users = Store.users.filter(u => u.username !== user);
                    await Store.save();
                    this.renderRbac();
                }
            });
        });
    }

    private static async addRbacUser(): Promise<void> {
        const user = (document.getElementById('regRbacUser') as HTMLInputElement).value.trim();
        const pass = (document.getElementById('regRbacPass') as HTMLInputElement).value;
        const role = (document.getElementById('regRbacRole') as HTMLSelectElement).value as UserRole;

        if (!user || !pass) {
            toast('Username and password are required.', 'warning');
            return;
        }

        const pwHash = await hashSecret(pass);
        Store.users.push({
            username: user,
            pwHash,
            role
        });
        await Store.save();
        toast(`User ${user} registered with role ${role}!`, 'success');

        (document.getElementById('regRbacUser') as HTMLInputElement).value = '';
        (document.getElementById('regRbacPass') as HTMLInputElement).value = '';
        this.renderRbac();
    }

    // --- RegEdit Modal ---
    private static openRegEdit(type: string, id: string, ws?: string): void {
        this.regEditAction = { type, id, ws };
        const modal = document.getElementById(this.regEditModalId);
        const title = document.getElementById('regEditTitle');
        const input = document.getElementById('regEditNameInput') as HTMLInputElement;
        const zoneGroup = document.getElementById('regEditZoneGroup');

        if (title) title.textContent = `Rename ${type.slice(0, -1)}: ${id}`;
        if (input) input.value = id;
        if (zoneGroup) zoneGroup.style.display = 'none';

        if (modal) modal.classList.add('active');
    }

    private static closeRegEdit(): void {
        const modal = document.getElementById(this.regEditModalId);
        if (modal) modal.classList.remove('active');
        this.regEditAction = null;
    }

    private static async applyRegEdit(): Promise<void> {
        if (!this.regEditAction) return;
        const newName = (document.getElementById('regEditNameInput') as HTMLInputElement).value.trim();
        if (!newName) return;

        const { type, id, ws } = this.regEditAction;
        if (type === 'programs') {
            Store.renameProgram(id, newName);
        } else if (type === 'workstations') {
            const idx = Store.workstations.indexOf(id);
            if (idx >= 0) Store.workstations[idx] = newName;
            Store.workposts.forEach(p => { if (p.ws === id) p.ws = newName; });
            Store.tools.forEach(t => {
                if (t.location.includes(id)) t.location = t.location.replace(id, newName);
                if (t.address && t.address.zone === id) t.address.zone = newName;
            });
        } else if (type === 'workposts') {
            const post = Store.workposts.find(p => p.name === id && p.ws === (ws || null));
            if (post) post.name = newName;
        }

        await Store.save();
        toast('Registry entry updated!', 'success');
        this.closeRegEdit();
        this.switchTab(this.currentTab);
    }
}
