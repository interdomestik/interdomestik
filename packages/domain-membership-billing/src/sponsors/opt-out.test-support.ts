import { resolveSponsorOptOutTenant } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, vi } from 'vitest';

import type { auditTransaction } from './audit-test-support';
import { optOutTokenHash } from './roster-crypto';

vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(),
}));
vi.mock('@interdomestik/database/sponsor-locks', () => ({
  lockSponsorPerson: vi.fn(),
  lockSponsorEntryIdentity: vi.fn(),
}));
vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  resolveSponsorOptOutTenant: vi.fn(),
}));
export const authority: TenantAuthority = mintTestTenantAuthority('tenant');
export const now = new Date('2027-01-01');
export const token = 'private-token';
export function use(db: ReturnType<typeof auditTransaction>): void {
  vi.mocked(withTenantAuthority).mockImplementation(async (_authority, fn) => fn(db.tx));
}
export function entry(
  id: string,
  termId: string,
  userId: string | null,
  patch: Record<string, unknown> = {}
) {
  return {
    id,
    termId,
    userId,
    emailHmac: 'private-hmac',
    tokenHash: optOutTokenHash(token),
    revokedAt: null,
    optedOutAt: null,
    ...patch,
  };
}
export function personRows(userId: string | null = 'member'): Record<string, unknown>[][] {
  return [
    [{ userId, emailHmac: 'private-hmac', sponsorId: 'sponsor', termId: 'term' }],
    [],
    [
      { id: 'term', termEnd: '2027-02-01T00:00:00Z', terminatedEffectiveAt: null },
      { id: 'next', termEnd: '2028-02-01T00:00:00Z', terminatedEffectiveAt: null },
    ],
    [entry('entry', 'term', userId), entry('future', 'next', userId)],
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveSponsorOptOutTenant).mockResolvedValue({
    authority,
    tenantId: 'tenant',
    entryId: 'entry',
  });
});
