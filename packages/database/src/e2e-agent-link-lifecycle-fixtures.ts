import { E2E_USER_IDS } from './e2e-role-fixtures';
import { goldenId } from './seed-utils/seed-ids';

export const E2E_AGENT_LINK_LIFECYCLE_INSTANTS = {
  ACTIVE: '2025-11-03T09:00:00.000Z',
  INACTIVE: '2025-11-10T09:00:00.000Z',
  REACTIVATED: '2025-11-17T09:00:00.000Z',
} as const;

/** One unique pair, three named checkpoints; its current row is the reactivated checkpoint. */
export const E2E_AGENT_LINK_LIFECYCLE_PAIR = {
  id: goldenId('ks_link_lifecycle'),
  tenantId: 'tenant_ks',
  agentId: E2E_USER_IDS.KS_AGENT_CASH_STATES,
  memberId: E2E_USER_IDS.KS_MEMBER_LINK_LIFECYCLE,
} as const;

export const E2E_AGENT_LINK_LIFECYCLE_FIXTURES = {
  ACTIVE: {
    auditId: goldenId('ks_link_lifecycle_active'),
    previousStatus: null,
    status: 'active',
    at: E2E_AGENT_LINK_LIFECYCLE_INSTANTS.ACTIVE,
  },
  INACTIVE: {
    auditId: goldenId('ks_link_lifecycle_inactive'),
    previousStatus: 'active',
    status: 'inactive',
    at: E2E_AGENT_LINK_LIFECYCLE_INSTANTS.INACTIVE,
  },
  REACTIVATED: {
    auditId: goldenId('ks_link_lifecycle_reactivated'),
    previousStatus: 'inactive',
    status: 'active',
    at: E2E_AGENT_LINK_LIFECYCLE_INSTANTS.REACTIVATED,
  },
} as const;

export type E2EAgentLinkLifecycleKey = keyof typeof E2E_AGENT_LINK_LIFECYCLE_FIXTURES;
