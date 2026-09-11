import { UserSession, UserRole } from '../types/personnel';
import { hasRole } from './rbac';
import { hashPw } from '../utils/crypto';
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
    } catch {}
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

  public async login(username: string, password: string): Promise<boolean> {
    const hash = await hashPw(password);
    const foundUser = Store.users.find(
      u => u.username.toLowerCase() === username.trim().toLowerCase() && u.pwHash === hash
    );

    if (foundUser) {
      this.current = { username: foundUser.username, role: foundUser.role };
      this.persist();
      Store.log('LOGIN', `User ${foundUser.username} logged in as ${foundUser.role}`, foundUser.username);
      this._notify();
      return true;
    }
    return false;
  }

  public async authenticateGate(loginInput: string, passInput: string): Promise<boolean> {
    const login = loginInput.trim().toLowerCase();
    const pass = passInput.trim();
    if (!login || !pass) return false;

    const hash = await hashPw(pass);
    const foundUser = Store.users.find(
      u => u.username.toLowerCase() === login && u.pwHash === hash
    );

    if (foundUser) {
      this.current = { username: foundUser.username, role: foundUser.role };
      this.persist();
      sessionStorage.setItem('inv_auth_active', 'true');
      Store.log('GATE_UNLOCK', foundUser.username, foundUser.username);
      Store.save();
      toast(T('UNLOCKED_WELCOME') + esc(foundUser.username));
      this._notify();
      return true;
    }
    return false;
  }

  public isGateLocked(): boolean {
    return sessionStorage.getItem('inv_auth_active') !== 'true';
  }

  public lockSystem(): void {
    sessionStorage.removeItem('inv_auth_active');
    this.current = { username: 'operator', role: 'Operator' };
    this.persist();
    toast(T('LOCKED'));
    this._notify();
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
