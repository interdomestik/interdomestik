export const DEFAULT_E2E_PASSWORD = 'GoldenPass123!'; // NOSONAR - deterministic local E2E fixture credential; CI injects a generated override.

type E2EPasswordEnv = Record<string, string | undefined>;

export function getE2EPassword(env: E2EPasswordEnv = process.env): string {
  const override = env.E2E_PASSWORD?.trim();
  return override && override.length > 0 ? override : DEFAULT_E2E_PASSWORD;
}

export const E2E_PASSWORD = getE2EPassword();

/** The one mailbox domain of every synthetic E2E identity; seeds and tests never spell it. */
export const E2E_EMAIL_DOMAIN = 'interdomestik.com';

/** The synthetic E2E address for a local part, always in {@link E2E_EMAIL_DOMAIN}. */
export function e2eEmail(local: string): string {
  return `${local}@${E2E_EMAIL_DOMAIN}`;
}

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
    email: e2eEmail('super'),
    name: 'Super Admin',
    dbRole: 'super_admin',
    tenantId: 'tenant_mk',
  },

  // MK USERS
  MK_ADMIN: {
    email: e2eEmail('admin.mk'),
    name: 'Aleksandar Stojanovski',
    dbRole: 'admin',
    tenantId: 'tenant_mk',
  },
  MK_STAFF: {
    email: e2eEmail('staff.mk'),
    name: 'Elena Petrovska',
    dbRole: 'staff',
    tenantId: 'tenant_mk',
    branchId: 'mk_branch_a',
  },
  MK_STAFF_2: {
    email: e2eEmail('staff.mk.2'),
    name: 'Aneta Nikolovska',
    dbRole: 'staff',
    tenantId: 'tenant_mk',
    branchId: 'mk_branch_a',
  },
  MK_BRANCH_MANAGER: {
    email: e2eEmail('bm.mk.a'),
    name: 'Marko Dimitrioski',
    dbRole: 'branch_manager',
    tenantId: 'tenant_mk',
    branchId: 'mk_branch_a',
  },
  MK_AGENT: {
    email: e2eEmail('agent.mk.a1'),
    name: 'Stefan Dimitrioski',
    dbRole: 'agent',
    tenantId: 'tenant_mk',
    branchId: 'mk_branch_a',
  },
  MK_MEMBER: {
    email: e2eEmail('member.mk.1'),
    name: 'Aleksandar Stojanovski',
    dbRole: 'member',
    tenantId: 'tenant_mk',
    branchId: 'mk_branch_a',
  },
  MK_AGENT_BALKAN: {
    email: e2eEmail('agent.balkan.1'),
    name: 'Balkan Agent 1',
    dbRole: 'agent',
    tenantId: 'tenant_mk',
    branchId: 'mk_branch_a',
  },

  // PILOT C1 (MK)
  PILOT_MK_ADMIN: {
    email: e2eEmail('admin.pilot'),
    name: 'Ardit Krasniqi',
    dbRole: 'admin',
    tenantId: 'pilot-mk',
  },
  PILOT_MK_AGENT: {
    email: e2eEmail('agent.pilot'),
    name: 'Eset Hoxha',
    dbRole: 'agent',
    tenantId: 'pilot-mk',
  },
  PILOT_MK_AGENT_2: {
    email: e2eEmail('agent.pilot.2'),
    name: 'Bekim Hoxha',
    dbRole: 'agent',
    tenantId: 'pilot-mk',
  },
  PILOT_MK_STAFF: {
    email: e2eEmail('staff.pilot'),
    name: 'Gazmend Abazi',
    dbRole: 'staff',
    tenantId: 'pilot-mk',
  },
  PILOT_MK_MEMBER: {
    email: e2eEmail('member.pilot.prishtina.01'),
    name: 'Arta Krasniqi',
    dbRole: 'member',
    tenantId: 'pilot-mk',
    branchId: 'pilot_branch_prishtina_central',
  },

  // KS USERS
  KS_ADMIN: {
    email: e2eEmail('admin.ks'),
    name: 'Arbër Krasniqi',
    dbRole: 'tenant_admin',
    tenantId: 'tenant_ks',
  },
  KS_STAFF: {
    email: e2eEmail('staff.ks'),
    name: 'Drita Gashi',
    dbRole: 'staff',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_a',
  },
  KS_AGENT: {
    email: e2eEmail('agent.ks.a1'),
    name: 'Blerim Hoxha',
    dbRole: 'agent',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_a',
  },
  KS_BRANCH_MANAGER: {
    email: e2eEmail('bm.ks.a'),
    name: 'Liridon Kastrati',
    dbRole: 'branch_manager',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_a',
  },
  KS_MEMBER: {
    email: e2eEmail('member.ks.a1'),
    name: 'KS A-Member 1',
    dbRole: 'member',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_a',
  },
  KS_MEMBER_A2: {
    email: e2eEmail('member.ks.a2'),
    name: 'KS A-Member 2',
    dbRole: 'member',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_a',
  },
  KS_MEMBER_A3: {
    email: e2eEmail('member.ks.a3'),
    name: 'KS A-Member 3',
    dbRole: 'member',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_a',
  },
  KS_MEMBER_B1: {
    email: e2eEmail('member.ks.b1'),
    name: 'KS B-Member 1',
    dbRole: 'member',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_b',
  },
  KS_MEMBER_EMPTY: {
    email: e2eEmail('member.ks.empty'),
    name: 'KS Empty Member',
    dbRole: 'member',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_a',
  },
  KS_MEMBER_TRACKING: {
    email: e2eEmail('member.tracking.ks'),
    name: 'KS Tracking Demo',
    dbRole: 'member',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_a',
  },
  // KS members with one membership lifecycle state each (E2E_MEMBERSHIP_LIFECYCLE_FIXTURES).
  KS_MEMBER_TRIALING: {
    email: e2eEmail('member.ks.trialing'),
    name: 'KS Trialing Member',
    dbRole: 'member',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_a',
  },
  KS_MEMBER_IN_GRACE: {
    email: e2eEmail('member.ks.grace'),
    name: 'KS In-Grace Member',
    dbRole: 'member',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_a',
  },
  KS_MEMBER_GRACE_EXPIRED: {
    email: e2eEmail('member.ks.grace-expired'),
    name: 'KS Grace-Expired Member',
    dbRole: 'member',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_a',
  },
  KS_MEMBER_SCHEDULED_CANCEL: {
    email: e2eEmail('member.ks.scheduled-cancel'),
    name: 'KS Scheduled-Cancel Member',
    dbRole: 'member',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_a',
  },
  KS_MEMBER_CANCELED: {
    email: e2eEmail('member.ks.canceled'),
    name: 'KS Canceled Member',
    dbRole: 'member',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_a',
  },
  KS_MEMBER_EXPIRED: {
    email: e2eEmail('member.ks.expired'),
    name: 'KS Expired Member',
    dbRole: 'member',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_a',
  },
  KS_MEMBER_NO_SUBSCRIPTION: {
    email: e2eEmail('member.ks.no-subscription'),
    name: 'KS No-Subscription Member',
    dbRole: 'member',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_a',
  },
  KS_AGENT_BRANCH_C: {
    email: e2eEmail('agent.ks.c1'),
    name: 'Luan Berisha',
    dbRole: 'agent',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_c',
  },
  // Branchless KS staff: assigned to other cases, never to the KS anchor case.
  KS_STAFF_UNASSIGNED: {
    email: e2eEmail('staff.ks.2'),
    name: 'Besian Mustafa',
    dbRole: 'staff',
    tenantId: 'tenant_ks',
  },
  // KS branch B agent whose only client link is inactive (attribution without access).
  KS_AGENT_INACTIVE_LINK: {
    email: e2eEmail('agent.ks.b1'),
    name: 'Valmir Shala',
    dbRole: 'agent',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_b',
  },

  // PLATFORM READ ROLES (home tenant only; the runtime has no tenant-selection field)
  GLOBAL_SUPPORT: {
    email: e2eEmail('support.global'),
    name: 'Global Support',
    dbRole: 'global_support',
    tenantId: 'tenant_ks',
  },
  AUDITOR: {
    email: e2eEmail('auditor.mk'),
    name: 'Assurance Auditor',
    dbRole: 'auditor',
    tenantId: 'tenant_mk',
  },
} as const;

export type E2EUserKey = keyof typeof E2E_USERS;

/** Identities created by seed packs on top of the golden catalogue (not E2E login accounts). */
export const E2E_PACK_USERS = {
  // Branchless KS staff created by the KS workflow pack.
  KS_STAFF: { email: e2eEmail('staff.ks.extra'), name: 'Agim Ramadani', tenantId: 'tenant_ks' },
} as const;
