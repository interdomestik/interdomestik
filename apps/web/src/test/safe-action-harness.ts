import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';

// Shared fixtures for the safe-action tests. Mocks stay in each test file (vi.mock is hoisted).

export type HarnessUser = {
  id: string;
  role: string | null;
  tenantId: string;
  branchId?: string | null;
  agentId?: string | null;
  email?: string;
  name?: string;
};

export function authorizedSession(user: HarnessUser) {
  const session = {
    user: {
      email: `${user.id}@example.test`,
      name: user.id,
      branchId: null,
      agentId: null,
      ...user,
    },
    session: {},
  };
  const authority = mintTestTenantAuthority(user.tenantId, {
    userId: user.id,
    role: user.role,
  });
  return Object.freeze({ session, authority });
}

export const MEMBER_A = { id: 'member-a', role: 'member', tenantId: 'tenant-a' } as const;
export const STAFF_A = { id: 'staff-a', role: 'staff', tenantId: 'tenant-a' } as const;
export const MANAGER_NO_BRANCH = {
  id: 'manager-a',
  role: 'branch_manager',
  tenantId: 'tenant-a',
  branchId: null,
} as const;
