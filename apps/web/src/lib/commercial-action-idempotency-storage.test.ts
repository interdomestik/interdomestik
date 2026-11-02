import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const returning = vi.fn();
  const limit = vi.fn();
  const where = vi.fn();
  const tx = {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ onConflictDoNothing: vi.fn(() => ({ returning })) })),
    })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where })) })),
    delete: vi.fn(() => ({ where })),
  };
  return { limit, returning, tx, where, withTenantContext: vi.fn() };
});

vi.mock('@interdomestik/database', () => ({
  and: (...conditions: unknown[]) => ['and', ...conditions],
  commercialActionIdempotency: {
    action: 'action_col',
    actorUserId: 'actor_col',
    id: 'id_col',
    idempotencyKey: 'key_col',
    requestFingerprintHash: 'hash_col',
    responsePayload: 'payload_col',
    status: 'status_col',
    tenantId: 'tenant_col',
  },
  eq: (left: unknown, right: unknown) => ['eq', left, right],
  isNull: (column: unknown) => ['isNull', column],
  withTenantContext: mocks.withTenantContext,
}));

import {
  completeCommercialActionReservation,
  findExistingReservation,
  releaseCommercialActionReservation,
  reserveCommercialAction,
  type ResolvedCommercialActionIdempotencyScope,
} from './commercial-action-idempotency-storage';

const authority = mintTestTenantAuthority('tenant-1');
const scope: ResolvedCommercialActionIdempotencyScope = {
  kind: 'tenant',
  authority,
  actorUserId: 'user-1',
};

describe('commercial action idempotency storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withTenantContext.mockImplementation(
      async (_authority: unknown, action: (tx: unknown) => unknown) => action(mocks.tx)
    );
    mocks.returning.mockResolvedValue([{ id: 'reservation-1' }]);
    mocks.limit.mockResolvedValue([]);
    mocks.where.mockResolvedValue(undefined);
  });

  it('reserves under the scope authority and stamps the authority tenant on the row', async () => {
    const reservation = await reserveCommercialAction({
      action: 'claim.submit',
      idempotencyKey: 'key-1',
      requestFingerprintHash: 'hash-1',
      scope,
    });

    expect(reservation).toEqual({ id: 'reservation-1' });
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext.mock.calls[0]?.[0]).toBe(authority);
    const insertValues = mocks.tx.insert.mock.results[0]?.value.values as ReturnType<typeof vi.fn>;
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', actorUserId: 'user-1', status: 'pending' })
    );
  });

  it('returns null when the reservation already exists', async () => {
    mocks.returning.mockResolvedValue([]);

    await expect(
      reserveCommercialAction({
        action: 'claim.submit',
        idempotencyKey: 'key-1',
        requestFingerprintHash: 'hash-1',
        scope,
      })
    ).resolves.toBeNull();
  });

  it('finds, completes and releases a reservation under the same authority', async () => {
    mocks.limit.mockResolvedValueOnce([
      {
        id: 'reservation-1',
        requestFingerprintHash: 'hash-1',
        responsePayload: { success: true },
        status: 'completed',
      },
    ]);

    await expect(findExistingReservation('claim.submit', 'key-1', scope)).resolves.toMatchObject({
      id: 'reservation-1',
    });
    await completeCommercialActionReservation({
      reservationId: 'reservation-1',
      responsePayload: { success: true },
      scope,
    });
    await releaseCommercialActionReservation({ reservationId: 'reservation-1', scope });

    expect(mocks.withTenantContext).toHaveBeenCalledTimes(3);
    for (const call of mocks.withTenantContext.mock.calls) expect(call[0]).toBe(authority);
    expect(mocks.tx.update).toHaveBeenCalledTimes(1);
    expect(mocks.tx.delete).toHaveBeenCalledTimes(1);
  });
});
