import { beforeEach, vi } from 'vitest';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type { AuthorizedSession } from '@/lib/tenant-authority.server';

const acceptanceMocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  readAcceptance: vi.fn(),
  recordAcceptance: vi.fn(),
  listMissingAcceptance: vi.fn(),
}));
export { acceptanceMocks };

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: acceptanceMocks.authorize,
}));
vi.mock('@interdomestik/domain-privacy/acceptance', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/domain-privacy/acceptance')>()),
  readOwnAcceptanceState: acceptanceMocks.readAcceptance,
  acceptLegalDocuments: acceptanceMocks.recordAcceptance,
  listMembersWithoutAcceptance: acceptanceMocks.listMissingAcceptance,
}));
vi.mock('@interdomestik/database/tenant-authority', async importOriginal => {
  const actual = await importOriginal<typeof import('@interdomestik/database/tenant-authority')>();
  return {
    ...actual,
    readTenantAuthority: (authority: Parameters<typeof actual.readTenantAuthority>[0]) => ({
      ...actual.readTenantAuthority(authority),
      purpose: 'session',
    }),
  };
});

export const memberUser = {
  id: 'fixture-member',
  role: 'member',
  tenantId: 'tenant_ks',
  email: 'fixture-member@example.test',
};
export const missingAcceptance = {
  accepted: false,
  missing: [{ kind: 'terms', version: 'fixture-current' }],
};
export const memberAuthority = mintTestTenantAuthority(memberUser.tenantId, {
  userId: memberUser.id,
  role: memberUser.role,
});

beforeEach(() => {
  vi.clearAllMocks();
  acceptanceMocks.authorize.mockResolvedValue({
    authority: memberAuthority,
    session: { user: memberUser } as AuthorizedSession['session'],
  });
  acceptanceMocks.readAcceptance.mockResolvedValue(missingAcceptance);
});
