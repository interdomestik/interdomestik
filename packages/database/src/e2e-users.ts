export const E2E_PASSWORD = 'GoldenPass123!';

/**
 * Single source of truth for E2E user identities and expected DB states.
 * Keys (e.g., 'KS_ADMIN') are used in tests for login.
 * Values define the strict identity contract:
 * - email: Login credential
 * - dbRole: The exact role string expected in the database (and valid session)
 * - tenantId: The tenant this user belongs to
 * - testRole: Legacy role key sometimes used in tests (DEPRECATED: migrate to using the E2E_USERS key logic)
 */
export const E2E_USERS = {
  // SUPER ADMIN
  SUPER_ADMIN: {
    email: 'super@interdomestik.com',
    name: 'Super Admin',
    dbRole: 'super_admin',
    tenantId: 'tenant_mk',
  },

  // MK USERS
  MK_ADMIN: {
    email: 'admin.mk@interdomestik.com',
    name: 'Aleksandar Stojanovski',
    dbRole: 'admin',
    tenantId: 'tenant_mk',
  },
  MK_STAFF: {
    email: 'staff.mk@interdomestik.com',
    name: 'Elena Petrovska',
    dbRole: 'staff',
    tenantId: 'tenant_mk',
  },
  MK_BRANCH_MANAGER: {
    email: 'bm.mk.a@interdomestik.com',
    name: 'Marko Dimitrioski',
    dbRole: 'branch_manager',
    tenantId: 'tenant_mk',
    branchId: 'mk_branch_a',
  },
  MK_AGENT: {
    email: 'agent.mk.a1@interdomestik.com',
    name: 'Stefan Dimitrioski',
    dbRole: 'agent',
    tenantId: 'tenant_mk',
    branchId: 'mk_branch_a',
  },
  MK_MEMBER: {
    email: 'member.mk.1@interdomestik.com',
    name: 'Aleksandar Stojanovski',
    dbRole: 'member',
    tenantId: 'tenant_mk',
  },

  // KS USERS
  KS_ADMIN: {
    email: 'admin.ks@interdomestik.com',
    name: 'Arbër Krasniqi',
    dbRole: 'tenant_admin',
    tenantId: 'tenant_ks',
  },
  KS_STAFF: {
    email: 'staff.ks@interdomestik.com',
    name: 'Drita Gashi',
    dbRole: 'staff',
    tenantId: 'tenant_ks',
  },
  KS_AGENT: {
    email: 'agent.ks.a1@interdomestik.com',
    name: 'Blerim Hoxha',
    dbRole: 'agent',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_a',
  },
  KS_MEMBER: {
    email: 'member.ks.a1@interdomestik.com',
    name: 'KS A-Member 1',
    dbRole: 'member',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_a',
  },
} as const;

export type E2EUserKey = keyof typeof E2E_USERS;
