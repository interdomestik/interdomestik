import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@interdomestik/database', async () =>
  (await import('./commercial-action-idempotency-test-support')).databaseModuleMock()
);

import {
  claimParams,
  dbEntry,
  freeStartParams,
  insertValues,
  legacyPublicScope,
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
      claimParams({ scope: tenantScope('user-1', null), execute })
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

  it.each([
    ['free-start.submit', freeStartParams],
    ['claims.submit', claimParams],
  ] as const)(
    'rejects a legacy public (null-tenant) scope for %s before any storage access',
    async (_action, buildParams) => {
      const execute = vi.fn().mockResolvedValue({ success: true });

      const result = await runCommercialActionWithIdempotency(
        buildParams({ scope: legacyPublicScope() as never, execute })
      );

      expect(result).toEqual({
        success: false,
        error: 'Commercial action idempotency requires a tenant scope.',
        code: 'IDEMPOTENCY_TENANT_SCOPE_REQUIRED',
      });
      expect(execute).not.toHaveBeenCalled();
      expect(dbEntry.insert).not.toHaveBeenCalled();
      expect(dbEntry.select).not.toHaveBeenCalled();
      expect(withTenantContextMock).not.toHaveBeenCalled();
    }
  );
});
