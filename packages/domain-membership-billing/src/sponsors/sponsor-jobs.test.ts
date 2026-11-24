import { issueTenantMemberNumber } from '@interdomestik/database';
import { SalesClosedError } from '@interdomestik/database/pilot-switch';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { expect, it, vi } from 'vitest';

import { auditTransaction } from './audit-test-support';
import { provisionEntry } from './provisioning';
import { listProvisioningWork } from './provisioning-facts';
import { runSponsorProvisioning } from './sponsor-jobs';

vi.mock('@interdomestik/database', async original => ({
  ...(await original<typeof import('@interdomestik/database')>()),
  issueTenantMemberNumber: vi.fn(),
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(),
}));
vi.mock('./provisioning', () => ({ provisionEntry: vi.fn() }));
vi.mock('./provisioning-facts', () => ({ listProvisioningWork: vi.fn() }));

it('records the second entry as sales_closed and issues a number for the first entry only', async () => {
  const now = new Date('2027-02-01T00:00:00Z');
  const authority = mintTestTenantAuthority('scheduled-tenant');
  const db = auditTransaction({ selects: [[{ value: { enabled: true } }]] });
  vi.mocked(withTenantAuthority).mockImplementation(async (_authority, fn) => fn(db.tx));
  vi.mocked(listProvisioningWork).mockResolvedValue(['open-entry', 'closed-entry']);
  vi.mocked(provisionEntry)
    .mockResolvedValueOnce({ outcome: 'seated', createdUserId: 'created-member' })
    .mockRejectedValueOnce(new SalesClosedError());

  await expect(runSponsorProvisioning(authority, { now })).resolves.toEqual({
    processed: 2,
    failed: 0,
    outcomes: { seated: 1, sales_closed: 1 },
  });
  expect(provisionEntry).toHaveBeenNthCalledWith(
    1,
    authority,
    expect.objectContaining({ entryId: 'open-entry', now })
  );
  expect(provisionEntry).toHaveBeenNthCalledWith(
    2,
    authority,
    expect.objectContaining({ entryId: 'closed-entry', now })
  );
  expect(issueTenantMemberNumber).toHaveBeenCalledExactlyOnceWith(authority, {
    userId: 'created-member',
    joinedAt: now,
  });
});
