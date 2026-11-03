import { E2E_USERS, type E2EUserKey } from './e2e-users';

/**
 * Deterministic role and relationship fixture catalogue for the golden/e2e seed.
 *
 * Every runtime role (packages/shared-auth/src/permissions.ts ROLES) maps to at least one
 * seeded identity. Relationship fixtures name the exact rows that positive and denial tests
 * exercise. The catalogue describes seeded data only; it grants no access and encodes no policy.
 */

export const E2E_RUNTIME_ROLES = [
  'super_admin',
  'admin',
  'tenant_admin',
  'global_support',
  'auditor',
  'branch_manager',
  'staff',
  'agent',
  'member',
] as const;

export type E2ERuntimeRole = (typeof E2E_RUNTIME_ROLES)[number];

/** Seeded `user.id` for every E2E_USERS identity (golden id convention: `golden_<name>`). */
export const E2E_USER_IDS = {
  SUPER_ADMIN: 'golden_super_admin',
  MK_ADMIN: 'golden_mk_admin',
  MK_STAFF: 'golden_mk_staff',
  MK_BRANCH_MANAGER: 'golden_mk_bm_a',
  MK_AGENT: 'golden_mk_agent_a1',
  MK_MEMBER: 'golden_mk_member_1',
  PILOT_MK_ADMIN: 'golden_pilot_mk_admin',
  PILOT_MK_AGENT: 'golden_pilot_mk_agent',
  PILOT_MK_AGENT_2: 'golden_pilot_mk_agent_2',
  PILOT_MK_STAFF: 'golden_pilot_mk_staff',
  PILOT_MK_MEMBER: 'golden_pilot_prishtina_member_01',
  KS_ADMIN: 'golden_ks_admin',
  KS_STAFF: 'golden_ks_staff',
  KS_AGENT: 'golden_ks_agent_a1',
  KS_BRANCH_MANAGER: 'golden_ks_bm_a',
  KS_MEMBER: 'golden_ks_a_member_1',
  KS_MEMBER_EMPTY: 'golden_ks_empty_member',
  KS_STAFF_UNASSIGNED: 'golden_ks_staff_2',
  KS_AGENT_INACTIVE_LINK: 'golden_ks_b_agent_1',
  GLOBAL_SUPPORT: 'golden_global_support',
  AUDITOR: 'golden_auditor',
} as const satisfies Record<E2EUserKey, string>;

/**
 * Role matrix: the E2E_USERS keys that instantiate each runtime role, by tenant context.
 * The first key of each role is its primary fixture.
 */
export const E2E_ROLE_MATRIX = {
  super_admin: ['SUPER_ADMIN'],
  admin: ['MK_ADMIN', 'PILOT_MK_ADMIN'],
  tenant_admin: ['KS_ADMIN'],
  global_support: ['GLOBAL_SUPPORT'],
  auditor: ['AUDITOR'],
  branch_manager: ['KS_BRANCH_MANAGER', 'MK_BRANCH_MANAGER'],
  staff: ['KS_STAFF', 'KS_STAFF_UNASSIGNED', 'MK_STAFF', 'PILOT_MK_STAFF'],
  agent: ['KS_AGENT', 'KS_AGENT_INACTIVE_LINK', 'MK_AGENT', 'PILOT_MK_AGENT', 'PILOT_MK_AGENT_2'],
  member: ['KS_MEMBER', 'KS_MEMBER_EMPTY', 'MK_MEMBER', 'PILOT_MK_MEMBER'],
} as const satisfies Record<E2ERuntimeRole, readonly E2EUserKey[]>;

/** KS anchor case: owned by KS_MEMBER, active KS_AGENT client, assigned to KS_STAFF, branch KS-A. */
export const E2E_ANCHOR_CASE_ID = 'golden_ks_a_claim_01';

export const E2E_CASE_FIXTURES = {
  KS_ANCHOR: {
    id: E2E_ANCHOR_CASE_ID,
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_a',
    ownerUserId: E2E_USER_IDS.KS_MEMBER,
    agentId: E2E_USER_IDS.KS_AGENT,
    staffId: E2E_USER_IDS.KS_STAFF,
  },
  KS_OTHER_MEMBER: {
    id: 'golden_ks_a_claim_02',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_a',
    ownerUserId: 'golden_ks_a_member_2',
    agentId: E2E_USER_IDS.KS_AGENT,
    staffId: E2E_USER_IDS.KS_STAFF,
  },
  KS_OTHER_BRANCH: {
    id: 'golden_ks_b_claim_01',
    tenantId: 'tenant_ks',
    branchId: 'ks_branch_b',
    ownerUserId: 'golden_ks_b_member_1',
    agentId: E2E_USER_IDS.KS_AGENT_INACTIVE_LINK,
    staffId: E2E_USER_IDS.KS_STAFF,
  },
  MK_FOREIGN_TENANT: {
    id: 'golden_claim_mk_1',
    tenantId: 'tenant_mk',
    branchId: 'mk_branch_a',
    ownerUserId: E2E_USER_IDS.MK_MEMBER,
    agentId: null,
    staffId: null,
  },
} as const;

export const E2E_AGENT_LINK_FIXTURES = {
  KS_ACTIVE: {
    id: 'golden_assign_ks_a_1',
    tenantId: 'tenant_ks',
    agentId: E2E_USER_IDS.KS_AGENT,
    memberId: E2E_USER_IDS.KS_MEMBER,
    status: 'active',
  },
  KS_INACTIVE: {
    id: 'golden_assign_ks_b_1_inactive',
    tenantId: 'tenant_ks',
    agentId: E2E_USER_IDS.KS_AGENT_INACTIVE_LINK,
    memberId: 'golden_ks_b_member_1',
    status: 'inactive',
  },
  PILOT_OTHER_AGENT_CLIENT: {
    id: 'golden_assign_pilot_prishtina_bekim_8',
    tenantId: 'pilot-mk',
    agentId: E2E_USER_IDS.PILOT_MK_AGENT_2,
    memberId: 'golden_pilot_prishtina_member_08',
    status: 'active',
  },
} as const;

export const E2E_MESSAGE_FIXTURES = {
  KS_ANCHOR_PUBLIC: {
    id: 'golden_msg_ks_a_claim_01_public',
    tenantId: 'tenant_ks',
    claimId: E2E_ANCHOR_CASE_ID,
    senderId: E2E_USER_IDS.KS_STAFF,
    isInternal: false,
    content: 'We received your claim and are reviewing the documents.',
  },
  KS_ANCHOR_INTERNAL: {
    id: 'golden_msg_ks_a_claim_01_internal',
    tenantId: 'tenant_ks',
    claimId: E2E_ANCHOR_CASE_ID,
    senderId: E2E_USER_IDS.KS_STAFF,
    isInternal: true,
    content: 'Internal note: verify the police report before contacting the insurer.',
  },
} as const;

type RelationshipFixture = {
  description: string;
  allowedActor: E2EUserKey;
  deniedActor: E2EUserKey;
  caseId?: string;
  deniedCaseId?: string;
  memberId?: string;
};

/**
 * Named allow/deny relationships. Each pairs an actor expected to be allowed with an actor (or a
 * target) expected to be denied under the current runtime access rules.
 */
export const E2E_RELATIONSHIP_FIXTURES = {
  CROSS_TENANT: {
    description: 'KS tenant admin owns KS anchor case; MK case is outside its tenant.',
    allowedActor: 'KS_ADMIN',
    deniedActor: 'KS_ADMIN',
    caseId: E2E_CASE_FIXTURES.KS_ANCHOR.id,
    deniedCaseId: E2E_CASE_FIXTURES.MK_FOREIGN_TENANT.id,
  },
  CROSS_BRANCH: {
    description: 'KS-A branch manager reads KS-A anchor case; KS-B case is another branch.',
    allowedActor: 'KS_BRANCH_MANAGER',
    deniedActor: 'KS_BRANCH_MANAGER',
    caseId: E2E_CASE_FIXTURES.KS_ANCHOR.id,
    deniedCaseId: E2E_CASE_FIXTURES.KS_OTHER_BRANCH.id,
  },
  STAFF_ASSIGNMENT: {
    description:
      'Anchor case assigned to KS_STAFF; branchless KS_STAFF_UNASSIGNED is not assigned.',
    allowedActor: 'KS_STAFF',
    deniedActor: 'KS_STAFF_UNASSIGNED',
    caseId: E2E_CASE_FIXTURES.KS_ANCHOR.id,
  },
  AGENT_ACTIVE_VS_INACTIVE_LINK: {
    description:
      'KS_AGENT has an active link to the anchor case owner; KS_AGENT_INACTIVE_LINK keeps claim attribution on the KS-B case but its client link is inactive.',
    allowedActor: 'KS_AGENT',
    deniedActor: 'KS_AGENT_INACTIVE_LINK',
    caseId: E2E_CASE_FIXTURES.KS_ANCHOR.id,
    deniedCaseId: E2E_CASE_FIXTURES.KS_OTHER_BRANCH.id,
  },
  AGENT_OTHER_CLIENT: {
    description: "Pilot member 08 is PILOT_MK_AGENT_2's active client, not PILOT_MK_AGENT's.",
    allowedActor: 'PILOT_MK_AGENT_2',
    deniedActor: 'PILOT_MK_AGENT',
    memberId: E2E_AGENT_LINK_FIXTURES.PILOT_OTHER_AGENT_CLIENT.memberId,
  },
  MEMBER_OWNERSHIP: {
    description: 'KS_MEMBER owns the anchor case; the KS-A case 02 belongs to another member.',
    allowedActor: 'KS_MEMBER',
    deniedActor: 'KS_MEMBER',
    caseId: E2E_CASE_FIXTURES.KS_ANCHOR.id,
    deniedCaseId: E2E_CASE_FIXTURES.KS_OTHER_MEMBER.id,
  },
  INTERNAL_MESSAGE_VISIBILITY: {
    description:
      'Anchor case carries one public and one internal message; staff see both, the owning member only the public one.',
    allowedActor: 'KS_STAFF',
    deniedActor: 'KS_MEMBER',
    caseId: E2E_CASE_FIXTURES.KS_ANCHOR.id,
  },
} as const satisfies Record<string, RelationshipFixture>;

export type E2ERelationshipFixtureKey = keyof typeof E2E_RELATIONSHIP_FIXTURES;

export function e2eUserFixture(key: E2EUserKey) {
  return { key, id: E2E_USER_IDS[key], ...E2E_USERS[key] };
}
