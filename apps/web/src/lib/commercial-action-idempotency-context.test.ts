import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@interdomestik/database', async () =>
  (await import('./commercial-action-idempotency-test-support')).databaseModuleMock()
);

import {
  claimParams,
  dbEntry,
  deleteWhere,
  resetCommercialActionMocks,
  returning,
  selectLimit,
  tenantContexts,
  txEntry,
} from './commercial-action-idempotency-test-support';
import { runCommercialActionWithIdempotency } from './commercial-action-idempotency';

function expectTenantContextStorage(statements: number) {
  expect(tenantContexts).toEqual(
    Array.from({ length: statements }, () => ({ tenantId: 'tenant-1' }))
  );
  expect(dbEntry.insert).not.toHaveBeenCalled();
  expect(dbEntry.select).not.toHaveBeenCalled();
  expect(dbEntry.update).not.toHaveBeenCalled();
  expect(dbEntry.delete).not.toHaveBeenCalled();
}

describe('runCommercialActionWithIdempotency tenant RLS context', () => {
  beforeEach(() => {
    resetCommercialActionMocks();
  });

  it('reserves and completes through the tenant transaction instead of the unscoped client', async () => {
    const execute = vi.fn().mockResolvedValue({ success: true, claimId: 'claim-1' });

    await runCommercialActionWithIdempotency(claimParams({ execute }));

    expect(txEntry.insert).toHaveBeenCalledTimes(1);
    expect(txEntry.update).toHaveBeenCalledTimes(1);
    expectTenantContextStorage(2);
  });

  it('reads the replayed reservation inside its own tenant context', async () => {
    returning.mockResolvedValueOnce([]);
    selectLimit.mockResolvedValueOnce([
      {
        requestFingerprintHash: 'same-fingerprint',
        responsePayload: { success: true, claimId: 'claim-existing' },
        status: 'completed',
      },
    ]);

    await runCommercialActionWithIdempotency(
      claimParams({ fingerprintHash: 'same-fingerprint', execute: vi.fn() })
    );

    expect(txEntry.select).toHaveBeenCalledTimes(1);
    expectTenantContextStorage(2);
  });

  it('closes the reservation context before the action runs and releases explicit failures', async () => {
    const execute = vi.fn(async () => {
      // The reservation transaction must be closed before the action runs.
      expect(tenantContexts).toHaveLength(1);
      return { success: false as const, error: 'Claim submission unavailable.' };
    });

    await runCommercialActionWithIdempotency(claimParams({ execute }));

    expect(execute).toHaveBeenCalledTimes(1);
    expect(txEntry.delete).toHaveBeenCalledTimes(1);
    expect(deleteWhere).toHaveBeenCalledWith(['eq', 'id_col', 'idem_1']);
    expectTenantContextStorage(2);
  });

  it('releases the reservation in a tenant context when execution throws', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(runCommercialActionWithIdempotency(claimParams({ execute }))).rejects.toThrow(
      'boom'
    );

    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(deleteWhere).toHaveBeenCalledWith(['eq', 'id_col', 'idem_1']);
    expectTenantContextStorage(2);
  });
});
