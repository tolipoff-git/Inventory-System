// ============================================================================
// 5S Tool Command Center — GateModal Component (Security Gate & Auth)
// ============================================================================

import { T } from '../../../i18n';
import { Auth } from '../../../auth/authManager';
import { toast } from '../../../utils/dom';

export class GateModal {
    private static gateModalId = 'mandatoryLoginModal';
    private static loginModalId = 'loginModal';

    public static initGate(): void {
        let gate = document.getElementById(this.gateModalId);
        if (!gate) {
            this.createGateModalDOM();
            gate = document.getElementById(this.gateModalId);
        }

        const appContainer = document.getElementById('appMainContainer');

        if (Auth.isGateLocked()) {
            if (appContainer) appContainer.classList.add('locked');
            if (gate) gate.classList.add('active');
        } else {
            if (appContainer) appContainer.classList.remove('locked');
            if (gate) gate.classList.remove('active');
        }

        this.ensureLoginModalDOM();

        Auth.setPromptHandler(() => GateModal.openLoginPrompt());
    }

    public static openLoginPrompt(): void {
        let modal = document.getElementById(this.loginModalId);
        if (!modal) {
            this.ensureLoginModalDOM();
            modal = document.getElementById(this.loginModalId);
        }
        if (modal) {
            const userInp = modal.querySelector<HTMLInputElement>('#promptLoginUser');
            const passInp = modal.querySelector<HTMLInputElement>('#promptLoginPass');
            const errEl = modal.querySelector<HTMLElement>('#promptLoginError');
            if (userInp) userInp.value = '';
            if (passInp) passInp.value = '';
            if (errEl) errEl.style.display = 'none';
            modal.classList.add('active');
            setTimeout(() => userInp?.focus(), 50);
        }
    }

    public static closeLoginPrompt(): void {
        const modal = document.getElementById(this.loginModalId);
        if (modal) modal.classList.remove('active');
        Auth.clearPendingAction();
    }

    private static createGateModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.gateModalId;
        overlay.style.zIndex = '999999';
        overlay.style.background = 'var(--bg-color)';

        overlay.innerHTML = `
            <div class="modal" style="max-width:420px; text-align:center; border:1px solid var(--border); box-shadow:0 0 30px var(--neon-glow);">
                <div class="modal-header" style="justify-content:center;">
                    <h3 class="modal-title" style="font-family:var(--font-display); letter-spacing:1px;">🔒 5S Enterprise Security Gate</h3>
                </div>
                <div class="modal-body menu-stack">
                    <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">Authentication required to access plant inventory.</div>
                    <input type="text" id="gateLoginUser" class="form-control" placeholder="${T('Username')}" style="text-align:center;">
                    <input type="password" id="gateLoginPass" class="form-control" placeholder="${T('Password')}" style="text-align:center;">
                    <div id="gateLoginError" style="color:var(--danger); font-size:0.85rem; display:none; margin-top:6px;">${T('Invalid credentials')}</div>
                    <button class="btn btn-primary wide" id="gateLoginSubmitBtn" style="margin-top:14px; font-weight:bold; font-size:1.05rem;">${T('Authorize Access')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const submit = async () => {
            const user = (overlay.querySelector('#gateLoginUser') as HTMLInputElement).value;
            const pass = (overlay.querySelector('#gateLoginPass') as HTMLInputElement).value;
            const err = overlay.querySelector<HTMLElement>('#gateLoginError');

            const success = await Auth.authenticateGate(user, pass);
            if (success) {
                overlay.classList.remove('active');
                const appContainer = document.getElementById('appMainContainer');
                if (appContainer) appContainer.classList.remove('locked');
            } else {
                if (err) err.style.display = 'block';
            }
        };

        overlay.querySelector('#gateLoginSubmitBtn')?.addEventListener('click', submit);
        overlay.querySelectorAll('input').forEach(inp => {
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submit();
            });
        });
    }

    private static ensureLoginModalDOM(): void {
        if (document.getElementById(this.loginModalId)) return;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.loginModalId;

        overlay.innerHTML = `
            <div class="modal narrow" style="max-width:400px; text-align:center;">
                <div class="modal-header">
                    <h3 class="modal-title">🔒 ${T('Authentication Required')}</h3>
                    <button class="close-btn" id="promptLoginCloseBtn">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group" style="text-align:left;">
                        <label>${T('Username')}:</label>
                        <input type="text" id="promptLoginUser" class="form-control" placeholder="admin">
                    </div>
                    <div class="form-group" style="text-align:left;">
                        <label>${T('Password')}:</label>
                        <input type="password" id="promptLoginPass" class="form-control">
                    </div>
                    <div id="promptLoginError" style="color:var(--danger); font-size:0.85rem; display:none;">${T('Invalid credentials')}</div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="promptLoginCancelBtn">${T('Cancel')}</button>
                    <button class="btn btn-primary" id="promptLoginSubmitBtn">${T('Login')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#promptLoginCloseBtn')?.addEventListener('click', () => this.closeLoginPrompt());
        overlay.querySelector('#promptLoginCancelBtn')?.addEventListener('click', () => this.closeLoginPrompt());

        const submit = async () => {
            const user = (overlay.querySelector('#promptLoginUser') as HTMLInputElement).value;
            const pass = (overlay.querySelector('#promptLoginPass') as HTMLInputElement).value;
            const err = overlay.querySelector<HTMLElement>('#promptLoginError');

            const success = await Auth.login(user, pass);
            if (success) {
                toast(`Welcome ${user}!`, 'success');
                this.closeLoginPrompt();
                if (Auth.pendingAction) {
                    const action = Auth.pendingAction;
                    const reqRole = Auth.pendingRole;
                    Auth.clearPendingAction();
                    if (!reqRole || Auth.has(reqRole)) {
                        action();
                    } else {
                        toast('Insufficient permissions for this action', 'danger');
                    }
                }
            } else {
                if (err) err.style.display = 'block';
            }
        };

        overlay.querySelector('#promptLoginSubmitBtn')?.addEventListener('click', submit);
        overlay.querySelectorAll('input').forEach(inp => {
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submit();
            });
        });
    }
}
