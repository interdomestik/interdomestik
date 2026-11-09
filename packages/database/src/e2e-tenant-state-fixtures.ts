import { E2E_RELATIONSHIP_FIXTURES, E2E_USER_IDS } from './e2e-role-fixtures';
import { goldenId } from './seed-utils/seed-ids';

export const E2E_TENANT_STATE_INSTANTS = {
  CREATED: '2025-11-01T09:00:00.000Z',
  DEACTIVATED: '2025-11-05T09:00:00.000Z',
} as const;

/** New tenant rows are deliberately unpopulated; existing KS/MK/pilot tenants stay intact. */
export const E2E_TENANT_STATE_FIXTURES = {
  EMPTY_TENANT: {
    id: goldenId('tenant_empty'),
    name: 'Empty Dataset Tenant',
    legalName: 'Empty Dataset Tenant LLC',
    code: 'DATA-EMPTY',
    countryCode: 'XK',
    isActive: true,
  },
  INACTIVE_TENANT: {
    id: goldenId('tenant_inactive'),
    name: 'Inactive Dataset Tenant',
    legalName: 'Inactive Dataset Tenant LLC',
    code: 'DATA-INACTIVE',
    countryCode: 'XK',
    isActive: false,
  },
} as const;

export const E2E_BRANCH_STATE_FIXTURES = {
  INACTIVE_BRANCH: {
    id: goldenId('ks_branch_inactive'),
    tenantId: 'tenant_ks',
    name: 'KS Inactive Branch',
    slug: 'ks-branch-inactive',
    code: 'KS-I',
    isActive: false,
  },
  EMPTY_BRANCH: { id: 'mk_branch_empty', tenantId: 'tenant_mk' },
} as const;

/** The third existing tenant is pilot-mk, distinct from both KS and MK. */
export const E2E_THIRD_TENANT_FIXTURE = {
  tenantId: 'pilot-mk',
  branchId: 'pilot_branch_prishtina_central',
  memberId: E2E_USER_IDS.PILOT_MK_MEMBER,
  relationship: E2E_RELATIONSHIP_FIXTURES.CROSS_THIRD_TENANT,
} as const;
