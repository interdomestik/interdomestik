import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  returning: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({ withTenantContext: hoisted.withTenantContext }));
vi.mock('@interdomestik/database/schema', () => ({
  engagementEmailSends: {
    id: 'engagement_email_sends.id',
    tenantId: 'engagement_email_sends.tenant_id',
    dedupeKey: 'engagement_email_sends.dedupe_key',
    status: 'engagement_email_sends.status',
  },
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ op: 'and', conditions })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
}));

import { databaseMembershipConfirmationDeliveryRepository as repository } from './membership-confirmation-delivery-repository';

const pendingRow = (tenantId: string) => ({
  id: 'delivery_1',
  tenantId,
  userId: 'user_1',
  subscriptionId: null,
  dedupeKey: 'membership-confirmation:v1:tenant_mk:sub_1',
  status: 'authorized' as const,
  metadata: {},
});

describe('membership confirmation delivery repository', () => {
  const authority = mintTestTenantAuthority('tenant_mk');

  beforeEach(() => {
    vi.clearAllMocks();
    const tx = {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({ returning: hoisted.returning }),
        }),
      }),
      update: () => ({
        set: () => ({ where: () => ({ returning: hoisted.returning }) }),
      }),
    };
    hoisted.returning.mockResolvedValue([{ id: 'delivery_1' }]);
    hoisted.withTenantContext.mockImplementation(async (_context, callback) => callback(tx));
  });

  it('inserts the pending delivery under the authority', async () => {
    await expect(repository.insertPending(authority, pendingRow('tenant_mk'))).resolves.toEqual({
      id: 'delivery_1',
    });

    expect(hoisted.withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
  });

  it('refuses a row for another tenant than the authority before opening a context', async () => {
    await expect(repository.insertPending(authority, pendingRow('tenant_ks'))).rejects.toThrow(
      'tenant conflict: row=tenant_ks authority=tenant_mk'
    );

    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it.each([
    ['reclaimError', () => repository.reclaimError(authority, 'key')],
    ['markReady', () => repository.markReady(authority, 'delivery_1', 'key', 'sub_1')],
    ['markSkipped', () => repository.markSkipped(authority, 'delivery_1', 'key')],
    ['markSent', () => repository.markSent(authority, 'delivery_1', 'key', 'msg_1')],
    ['markError', () => repository.markError(authority, 'delivery_1', 'key', 'boom')],
  ])('%s writes only under the authority', async (_name, run) => {
    await expect(run()).resolves.toBe(true);

    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
  });
});
