import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { vi } from 'vitest';

import { getAgentWorkspaceClaimsCore } from './_core';

// Shared by the agent workspace core suites; each suite mocks @interdomestik/database itself.
export function createTx() {
  return {
    query: {
      claims: { findMany: vi.fn() },
      agentClients: { findMany: vi.fn() },
      user: { findFirst: vi.fn() },
    },
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn(),
    selectDistinctOn: vi.fn().mockReturnThis(),
    orderBy: vi.fn(),
  };
}

export type MockTx = ReturnType<typeof createTx>;

export function claimRow(id: string, memberId: string, updatedAt = new Date()) {
  return {
    id,
    claimNumber: `CLM-${id}`,
    user: { id: memberId, name: null, email: `${memberId}@test.com` },
    branch: { name: 'B1' },
    title: `Claim ${id}`,
    caseLifecycleState: 'submitted',
    recoveryLifecycleState: 'not_started',
    createdAt: updatedAt,
    updatedAt,
    userId: memberId,
  };
}

export type CoreParams = {
  tenantId: string;
  userId: string;
  role: string | null | undefined;
  selectedClaimId?: string;
};

export const baseParams: CoreParams = { tenantId: 't1', userId: 'a1', role: 'agent' };
let lastAuthority: TenantAuthority | undefined;

/** The authority minted by the most recent callCore. */
export function currentAuthority(): TenantAuthority | undefined {
  return lastAuthority;
}

// Mints the session authority the page would pass for this tenant, user and role.
export function callCore({ tenantId, userId, role, selectedClaimId }: CoreParams) {
  lastAuthority = mintTestTenantAuthority(tenantId, { userId, role: role ?? null });
  return getAgentWorkspaceClaimsCore({ authority: lastAuthority, selectedClaimId });
}
