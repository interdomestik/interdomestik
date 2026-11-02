import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { db } from '@interdomestik/database';
import { vi } from 'vitest';

export const authority: TenantAuthority = mintTestTenantAuthority('tenant_1');

vi.mock('@interdomestik/database', () => ({
  agentClients: {
    tenantId: 'agentClients.tenantId',
    memberId: 'agentClients.memberId',
    agentId: 'agentClients.agentId',
  },
  db: {
    transaction: vi.fn(),
    query: {
      agentSettings: {
        findFirst: vi.fn(),
      },
      referrals: {
        findFirst: vi.fn(),
      },
    },
  },
  appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
  and: vi.fn((...parts) => ({ op: 'and', parts })),
  eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
  withTenantContext: vi.fn(async (_context: unknown, callback: unknown) => {
    const { db } = await import('@interdomestik/database');
    return (db.transaction as any)(callback);
  }),
}));

vi.mock('../../../../../domain-referrals/src', () => ({
  createMemberReferralRewardCore: vi.fn(),
}));

vi.mock('../../../commissions/create', () => ({
  createCommissionWithDispositionCore: vi.fn(),
}));
