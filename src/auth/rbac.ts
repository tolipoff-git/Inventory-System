import { UserRole } from '../types/personnel';
import { ROLES } from '../config/constants';

export function hasRole(currentRole: UserRole, requiredRole: UserRole): boolean {
  return (ROLES[currentRole] || 1) >= (ROLES[requiredRole] || 1);
}

export function canCheckout(role: UserRole): boolean {
  return hasRole(role, 'Operator');
}

export function canManageCrib(role: UserRole): boolean {
  return hasRole(role, 'Tool Crib Manager');
}

export function canAdmin(role: UserRole): boolean {
  return hasRole(role, 'Administrator');
}
