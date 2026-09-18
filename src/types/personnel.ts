export type UserRole = 'Administrator' | 'Tool Crib Manager' | 'Operator';

export interface Employee {
  id: string;
  name: string;
  role: string;
  initials?: string;
  badge?: string;
  ws?: string;
  post?: string;
  careScore?: number;
  email?: string;
  phone?: string;
  shift?: string;
  active?: boolean;
  history?: string[];
  updatedAt?: string;
  /**
   * Soft-delete tombstone (ISO). Removal is expressed as a field rather than by
   * dropping the record, so a peer holding an older copy can no longer resurrect
   * it on the next merge; views filter tombstoned rows out via
   * `Store.activePersonnel()`.
   */
  deletedAt?: string;
}

export interface SystemUser {
  username: string;
  /** Salted PBKDF2 verifier ("pbkdf2$...") or legacy SHA-256 hex for migrated data. */
  pwHash: string;
  role: UserRole;
  /**
   * Bootstrap flag: true until the default account has a PIN set by the first
   * Administrator login. No precomputed secret is ever shipped in source.
   */
  needsPinSetup?: boolean;
}

export interface UserSession {
  username: string;
  role: UserRole;
}
