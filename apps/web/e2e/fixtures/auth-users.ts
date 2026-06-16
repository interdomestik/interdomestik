import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';

import { type Role, type Tenant } from './auth.project';

export function getUserForTenant(role: Role, tenant: Tenant) {
  if (role === 'admin_mk') return E2E_USERS.MK_ADMIN;

  if (role === 'branch_manager') {
    return tenant === 'mk' ? E2E_USERS.MK_BRANCH_MANAGER : E2E_USERS.KS_BRANCH_MANAGER;
  }

  if (tenant === 'pilot') {
    switch (role) {
      case 'member':
      case 'member_empty':
        return E2E_USERS.PILOT_MK_MEMBER;
      case 'admin':
        return E2E_USERS.PILOT_MK_ADMIN;
      case 'agent':
        return E2E_USERS.PILOT_MK_AGENT;
      case 'staff':
        return E2E_USERS.PILOT_MK_STAFF;
      default:
        throw new Error(`Role ${role} not implemented for pilot tenant`);
    }
  }

  if (tenant === 'mk') {
    switch (role) {
      case 'member':
      case 'member_empty':
        return E2E_USERS.MK_MEMBER;
      case 'admin':
        return E2E_USERS.MK_ADMIN;
      case 'agent':
        return E2E_USERS.MK_AGENT;
      case 'staff':
        return E2E_USERS.MK_STAFF;
    }
  }

  switch (role) {
    case 'member':
      return E2E_USERS.KS_MEMBER;
    case 'member_empty':
      return E2E_USERS.KS_MEMBER_EMPTY;
    case 'admin':
      return E2E_USERS.KS_ADMIN;
    case 'agent':
      return E2E_USERS.KS_AGENT;
    case 'staff':
      return E2E_USERS.KS_STAFF;
    default:
      return E2E_USERS.KS_MEMBER;
  }
}

export function credsFor(
  role: Role,
  tenant: Tenant
): { email: string; password: string; name: string } {
  const u = getUserForTenant(role, tenant);
  return { email: u.email, password: E2E_PASSWORD, name: u.name };
}
