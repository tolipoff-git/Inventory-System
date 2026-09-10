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
}

export interface SystemUser {
  username: string;
  pwHash: string;
  role: UserRole;
}

export interface UserSession {
  username: string;
  role: UserRole;
}
