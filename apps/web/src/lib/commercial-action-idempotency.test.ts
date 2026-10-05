import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@interdomestik/database', async () =>
  (await import('./commercial-action-idempotency-test-support')).databaseModuleMock()
);

import {
  claimParams,
  dbEntry,
  freeStartParams,
  insertValues,
  publicFreeStartScope,
  resetCommercialActionMocks,
  returning,
  selectLimit,
  selectWhere,
  tenantScope,
  txEntry,
  updateSet,
  withTenantContextMock,
} from './commercial-action-idempotency-test-support';
import { runCommercialActionWithIdempotency } from './commercial-action-idempotency';

function expectTenantLookup(actorUserId = 'user-1') {
  expect(selectWhere).toHaveBeenCalledWith(
    expect.arrayContaining([
      ['eq', 'tenant_id_col', 'tenant-1'],
      ['eq', 'actor_user_id_col', actorUserId],
    ])
  );
}

describe('runCommercialActionWithIdempotency', () => {
  beforeEach(() => {
    resetCommercialActionMocks();
  });

  it('executes once and persists the successful result for a fresh key', async () => {
    const execute = vi.fn().mockResolvedValue({ success: true, claimId: 'claim-1' });

    const result = await runCommercialActionWithIdempotency(claimParams({ execute }));

    expect(result).toEqual({ success: true, claimId: 'claim-1' });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'claims.submit',
        actorUserId: 'user-1',
        idempotencyKey: 'claim-submit-1',
        tenantId: 'tenant-1',
      })
    );
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        responsePayload: { success: true, claimId: 'claim-1' },
        status: 'completed',
      })
    );
  });

  it('returns the cached response and skips execution when the key already completed', async () => {
    returning.mockResolvedValueOnce([]);
    selectLimit.mockResolvedValueOnce([
      {
        requestFingerprintHash: 'same-fingerprint',
        responsePayload: { success: true, claimId: 'claim-existing' },
        status: 'completed',
      },
    ]);

    const execute = vi.fn().mockResolvedValue({ success: true, claimId: 'claim-new' });

    const result = await runCommercialActionWithIdempotency(
      claimParams({ fingerprintHash: 'same-fingerprint', execute })
    );

    expect(result).toEqual({ success: true, claimId: 'claim-existing' });
    expect(execute).not.toHaveBeenCalled();
    expectTenantLookup();
  });

  it('rejects a reused key when the payload fingerprint differs', async () => {
    returning.mockResolvedValueOnce([]);
    selectLimit.mockResolvedValueOnce([
      {
        requestFingerprintHash: 'original-fingerprint',
        responsePayload: { success: true, claimId: 'claim-existing' },
        status: 'completed',
      },
    ]);

    const result = await runCommercialActionWithIdempotency(
      claimParams({
        fingerprintHash: 'different-fingerprint',
        requestFingerprint: { category: 'vehicle', title: 'Different payload' },
        execute: vi.fn(),
      })
    );

    expect(result).toEqual({
      success: false,
      error: 'Idempotency key was reused for a different request.',
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
  });

  it('fails closed before execution or reservation when tenant scope is missing', async () => {
    const execute = vi.fn().mockResolvedValue({ success: true });

    const result = await runCommercialActionWithIdempotency(
      claimParams({ scope: tenantScope('user-1', '   '), execute })
    );

    expect(result).toEqual({
      success: false,
      error: 'Commercial action idempotency requires a tenant scope.',
      code: 'IDEMPOTENCY_TENANT_SCOPE_REQUIRED',
    });
    expect(execute).not.toHaveBeenCalled();
    expect(dbEntry.insert).not.toHaveBeenCalled();
    expect(txEntry.insert).not.toHaveBeenCalled();
    expect(withTenantContextMock).not.toHaveBeenCalled();
  });

  it('fails closed on same-key conflicts outside the resolved tenant scope', async () => {
    returning.mockResolvedValueOnce([]);
    selectLimit.mockResolvedValueOnce([]);

    const execute = vi.fn().mockResolvedValue({ success: true, claimId: 'claim-new' });

    const result = await runCommercialActionWithIdempotency(
      claimParams({ fingerprintHash: 'same-fingerprint', execute })
    );

    expect(result).toEqual({
      success: false,
      error: 'Idempotency key is already reserved for a different scope.',
      code: 'IDEMPOTENCY_SCOPE_CONFLICT',
    });
    expect(execute).not.toHaveBeenCalled();
    expectTenantLookup();
  });

  it('fails closed on same-tenant conflicts outside the resolved actor scope', async () => {
    returning.mockResolvedValueOnce([]);
    selectLimit.mockResolvedValueOnce([]);

    const execute = vi.fn().mockResolvedValue({ success: true, claimId: 'claim-new' });

    const result = await runCommercialActionWithIdempotency(
      claimParams({ scope: tenantScope('user-2'), fingerprintHash: 'same-fingerprint', execute })
    );

    expect(result).toEqual({
      success: false,
      error: 'Idempotency key is already reserved for a different scope.',
      code: 'IDEMPOTENCY_SCOPE_CONFLICT',
    });
    expect(execute).not.toHaveBeenCalled();
    expectTenantLookup('user-2');
  });

  it('allows explicit public idempotency only for allowlisted public actions', async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ success: true, data: { claimCategory: 'property' } });

    const result = await runCommercialActionWithIdempotency(freeStartParams({ execute }));

    expect(result).toEqual({ success: true, data: { claimCategory: 'property' } });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'free-start.submit',
        actorUserId: null,
        idempotencyKey: 'free-start-1',
        tenantId: null,
      })
    );
    expect(dbEntry.insert).toHaveBeenCalledTimes(1);
    expect(dbEntry.update).toHaveBeenCalledTimes(1);
    expect(withTenantContextMock).not.toHaveBeenCalled();
  });

  it('uses public null-tenant scope before releasing an allowlisted cached response', async () => {
    returning.mockResolvedValueOnce([]);
    selectLimit.mockResolvedValueOnce([
      {
        requestFingerprintHash: 'same-fingerprint',
        responsePayload: { success: true, data: { claimCategory: 'property' } },
        status: 'completed',
      },
    ]);

    const result = await runCommercialActionWithIdempotency(
      freeStartParams({ fingerprintHash: 'same-fingerprint', execute: vi.fn() })
    );

    expect(result).toEqual({ success: true, data: { claimCategory: 'property' } });
    expect(selectWhere).toHaveBeenCalledWith(
      expect.arrayContaining([
        ['isNull', 'tenant_id_col'],
        ['isNull', 'actor_user_id_col'],
      ])
    );
    expect(dbEntry.select).toHaveBeenCalledTimes(1);
    expect(withTenantContextMock).not.toHaveBeenCalled();
  });

  it('rejects public idempotency for non-allowlisted commercial actions', async () => {
    const execute = vi.fn().mockResolvedValue({ success: true });

    const result = await runCommercialActionWithIdempotency(
      claimParams({
        scope: publicFreeStartScope(),
        requestFingerprint: { category: 'vehicle' },
        execute,
      })
    );

    expect(result).toEqual({
      success: false,
      error: 'Public idempotency is not allowed for this commercial action.',
      code: 'PUBLIC_IDEMPOTENCY_NOT_ALLOWED',
    });
    expect(execute).not.toHaveBeenCalled();
    expect(dbEntry.insert).not.toHaveBeenCalled();
  });
});
