import { UserSession, UserRole, SystemUser } from '../types/personnel';
import { hasRole } from './rbac';
import { verifySecret, hashSecret } from '../utils/crypto';
import { Store } from '../storage/store';
import { toast } from '../utils/dom';
import { esc } from '../utils/formatters';
import { T } from '../i18n';

export type AuthPromptHandler = () => void;

class AuthManager {
  public current: UserSession = { username: 'operator', role: 'Operator' };
  public pendingAction: (() => void) | null = null;
  public pendingRole: UserRole | null = null;
  private _authListeners: Set<(session: UserSession) => void> = new Set();
  private _promptHandler: AuthPromptHandler | null = null;

  constructor() {
    try {
      const saved = localStorage.getItem('currentUser');
      if (saved) {
        this.current = JSON.parse(saved);
      }
    } catch (e) {
      console.error('[authManager:constructor] Failed to restore session from localStorage', e);
    }
  }

  public subscribe(cb: (session: UserSession) => void): () => void {
    this._authListeners.add(cb);
    return () => this._authListeners.delete(cb);
  }

  private _notify(): void {
    this._authListeners.forEach(cb => {
      try {
        cb(this.current);
      } catch (e) {
        console.error('Auth listener error:', e);
      }
    });
  }

  public getCurrentUser(): string {
    return this.current.username;
  }

  public getCurrentRole(): UserRole {
    return this.current.role;
  }

  public has(requiredRole: UserRole): boolean {
    return hasRole(this.current.role, requiredRole);
  }

  public persist(): void {
    try {
      localStorage.setItem('currentUser', JSON.stringify(this.current));
    } catch (e) {
      console.error('Failed to persist user session', e);
    }
  }

  /**
   * Set the initial PIN for a bootstrap account (needsPinSetup). The supplied
   * passphrase becomes the account's verifier; on success the session is
   * established exactly like a normal login.
   *
   * To prevent PIN-claim race on a fresh database, only the very first
   * Administrator account may adopt an initial PIN. Any later unset account
   * must be provisioned through the registered-user admin flow instead.
   */
  public async setupPin(username: string, passphrase: string): Promise<boolean> {
    const user = Store.users.find(
      u => u.username.toLowerCase() === username.trim().toLowerCase()
    );
    if (!user || !user.needsPinSetup || !passphrase) return false;

    const adminConfigured = Store.users.some(
      u => u.role === 'Administrator' && !u.needsPinSetup && typeof u.pwHash === 'string' && u.pwHash !== ''
    );
    const isFirstAdmin = user.role === 'Administrator' && !adminConfigured;
    if (!isFirstAdmin) {
      if (user.role === 'Administrator' && adminConfigured) {
        toast(T('BOOTSTRAP_ADMIN_EXISTS'), 'warning'); // the initial PIN was already claimed
      }
      return false; // only the bootstrap Administrator adopts a PIN
    }

    user.pwHash = await hashSecret(passphrase);
    user.needsPinSetup = false;
    Store.log('PIN_SETUP', `Initial Administrator PIN configured for ${user.username}`, user.username);
    await Store.save();

    this.current = { username: user.username, role: user.role };
    this.persist();
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('inv_auth_active', 'true');
    }
    this._notify();
    return true;
  }

  /** True when at least one account still needs its initial PIN configured. */
  public hasUnsetPins(): boolean {
    return Store.users.some(u => u.needsPinSetup);
  }

  public isGateLocked(): boolean {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('inv_auth_active') !== 'true';
  }

  public lockSystem(): void {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('inv_auth_active');
    }
    this.current = { username: 'operator', role: 'Operator' };
    this.persist();
    toast(T('LOCKED'));
    this._notify();
  }

  /**
   * Upgrade a legacy SHA-256 verifier to the salted PBKDF2 format in place
   * after a successful login (only when the stored verifier is still legacy).
   */
  private async upgradeLegacyVerifier(user: SystemUser, password: string): Promise<void> {
    if (user.needsPinSetup) return;
    if (typeof user.pwHash === 'string' && user.pwHash.startsWith('pbkdf2$')) return;
    user.pwHash = await hashSecret(password);
    Store.log('PIN_UPGRADED', `Verifier upgraded to PBKDF2 for ${user.username}`, user.username);
    await Store.save();
  }

  public async login(username: string, password: string): Promise<boolean> {
    const foundUser = Store.users.find(
      u => u.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (!foundUser) return false;

    // Bootstrap path: account has no verifier yet — the supplied password is
    // the initial PIN, applied on first login only.
    if (foundUser.needsPinSetup) {
      return await this.setupPin(foundUser.username, password);
    }

    if (await verifySecret(password, foundUser.pwHash)) {
      this.current = { username: foundUser.username, role: foundUser.role };
      this.persist();
      Store.log('LOGIN', `User ${foundUser.username} logged in as ${foundUser.role}`, foundUser.username);
      await this.upgradeLegacyVerifier(foundUser, password);
      this._notify();
      return true;
    }
    return false;
  }

  public async authenticateGate(loginInput: string, passInput: string): Promise<boolean> {
    const login = loginInput.trim().toLowerCase();
    const pass = passInput.trim();
    if (!login || !pass) return false;

    const foundUser = Store.users.find(
      u => u.username.toLowerCase() === login
    );

    if (!foundUser) return false;

    // Bootstrap path (same as login): the gate PIN becomes the initial PIN.
    if (foundUser.needsPinSetup) {
      return await this.setupPin(foundUser.username, pass);
    }

    if (await verifySecret(pass, foundUser.pwHash)) {
      this.current = { username: foundUser.username, role: foundUser.role };
      this.persist();
      sessionStorage.setItem('inv_auth_active', 'true');
      Store.log('GATE_UNLOCK', foundUser.username, foundUser.username);
      await this.upgradeLegacyVerifier(foundUser, pass);
      Store.save();
      toast(T('UNLOCKED_WELCOME') + esc(foundUser.username));
      this._notify();
      return true;
    }
    return false;
  }

  public setPromptHandler(handler: AuthPromptHandler): void {
    this._promptHandler = handler;
  }

  public clearPendingAction(): void {
    this.pendingAction = null;
    this.pendingRole = null;
  }

  public doAction(requiredRole: UserRole, callback: () => void): void {
    if (this.has(requiredRole)) {
      callback();
      return;
    }
    this.pendingRole = requiredRole;
    this.pendingAction = callback;
    if (this._promptHandler) {
      this._promptHandler();
    } else if (typeof document !== 'undefined') {
      const loginModal = document.getElementById('loginModal');
      if (loginModal) {
        loginModal.classList.add('active');
        const userEl = document.getElementById('promptLoginUser') as HTMLInputElement;
        const passEl = document.getElementById('promptLoginPass') as HTMLInputElement;
        const errEl = document.getElementById('promptLoginError');
        if (userEl) userEl.value = '';
        if (passEl) passEl.value = '';
        if (errEl) (errEl as HTMLElement).style.display = 'none';
        setTimeout(() => userEl?.focus(), 50);
      }
    }
  }
}

export const Auth = new AuthManager();
