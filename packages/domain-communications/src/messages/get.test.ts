import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  withTenant: vi.fn(() => ({ scoped: true })),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      claims: { findFirst: mocks.findFirst },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => []),
          })),
        })),
      })),
    })),
  },
  claimMessages: {
    id: 'messages.id',
    claimId: 'messages.claim_id',
    senderId: 'messages.sender_id',
    content: 'messages.content',
    isInternal: 'messages.is_internal',
    readAt: 'messages.read_at',
    createdAt: 'messages.created_at',
    tenantId: 'messages.tenant_id',
  },
  user: {
    id: 'user.id',
    name: 'user.name',
    image: 'user.image',
    role: 'user.role',
  },
  eq: vi.fn((left, right) => ({ left, right })),
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn(() => 'tenant-1'),
}));

import { getMessagesForClaimCore } from './get';

describe('getMessagesForClaimCore', () => {
  it('scopes claim lookup with tenant filter', async () => {
    mocks.findFirst.mockImplementationOnce(({ where }: { where: Function }) => {
      where({ id: 'claims.id', tenantId: 'claims.tenant_id' }, { eq: vi.fn(() => ({ eq: true })) });
      return null;
    });

    const result = await getMessagesForClaimCore({
      session: { user: { id: 'user-1', role: 'user', tenantId: 'tenant-1' } } as never,
      claimId: 'claim-1',
    });

    expect(result).toEqual({ success: false, error: 'Claim not found' });
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-1',
      'claims.tenant_id',
      expect.any(Object)
    );
  });
});
