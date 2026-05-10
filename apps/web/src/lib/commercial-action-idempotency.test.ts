import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  insert: vi.fn(),
  insertValues: vi.fn(),
  onConflictDoNothing: vi.fn(),
  returning: vi.fn(),
  select: vi.fn(),
  selectFrom: vi.fn(),
  selectWhere: vi.fn(),
  selectLimit: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  delete: vi.fn(),
  deleteWhere: vi.fn(),
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    insert: hoisted.insert,
    select: hoisted.select,
    update: hoisted.update,
    delete: hoisted.delete,
  },
  commercialActionIdempotency: {
    id: 'id_col',
    action: 'action_col',
    idempotencyKey: 'idempotency_key_col',
    requestFingerprintHash: 'request_fingerprint_hash_col',
    status: 'status_col',
    responsePayload: 'response_payload_col',
    tenantId: 'tenant_id_col',
    actorUserId: 'actor_user_id_col',
  },
  and: hoisted.and,
  eq: hoisted.eq,
  isNull: hoisted.isNull,
}));

import { runCommercialActionWithIdempotency } from './commercial-action-idempotency';

type CommercialActionParams = Parameters<typeof runCommercialActionWithIdempotency>[0];

const DEFAULT_CLAIM_FINGERPRINT = { category: 'vehicle', title: 'Damaged bumper' };
const DEFAULT_FREE_START_FINGERPRINT = { category: 'property' };

function tenantScope(actorUserId = 'user-1', tenantId = 'tenant-1') {
  return {
    kind: 'tenant' as const,
    actorUserId,
    tenantId,
  };
}

function publicFreeStartScope() {
  return {
    kind: 'public' as const,
    reason: 'public-free-start-intake-no-tenant-mutation' as const,
  };
}

function claimParams(overrides: Partial<CommercialActionParams> = {}): CommercialActionParams {
  return {
    action: 'claims.submit',
    scope: tenantScope(),
    idempotencyKey: 'claim-submit-1',
    requestFingerprint: DEFAULT_CLAIM_FINGERPRINT,
    execute: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

function freeStartParams(overrides: Partial<CommercialActionParams> = {}): CommercialActionParams {
  return {
    action: 'free-start.submit',
    scope: publicFreeStartScope(),
    idempotencyKey: 'free-start-1',
    requestFingerprint: DEFAULT_FREE_START_FINGERPRINT,
    execute: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

function expectTenantLookup(actorUserId = 'user-1') {
  expect(hoisted.selectWhere).toHaveBeenCalledWith(
    expect.arrayContaining([
      ['eq', 'tenant_id_col', 'tenant-1'],
      ['eq', 'actor_user_id_col', actorUserId],
    ])
  );
}

describe('runCommercialActionWithIdempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.returning.mockResolvedValue([{ id: 'idem_1' }]);
    hoisted.onConflictDoNothing.mockReturnValue({
      returning: hoisted.returning,
    });
    hoisted.insertValues.mockReturnValue({
      onConflictDoNothing: hoisted.onConflictDoNothing,
    });
    hoisted.insert.mockReturnValue({
      values: hoisted.insertValues,
    });

    hoisted.selectLimit.mockResolvedValue([]);
    hoisted.selectWhere.mockReturnValue({ limit: hoisted.selectLimit });
    hoisted.selectFrom.mockReturnValue({ where: hoisted.selectWhere });
    hoisted.select.mockReturnValue({ from: hoisted.selectFrom });

    hoisted.updateWhere.mockResolvedValue(undefined);
    hoisted.updateSet.mockReturnValue({ where: hoisted.updateWhere });
    hoisted.update.mockReturnValue({ set: hoisted.updateSet });

    hoisted.deleteWhere.mockResolvedValue(undefined);
    hoisted.delete.mockReturnValue({ where: hoisted.deleteWhere });

    hoisted.and.mockImplementation((...args: unknown[]) => ['and', ...args]);
    hoisted.eq.mockImplementation((...args: unknown[]) => ['eq', ...args]);
    hoisted.isNull.mockImplementation((...args: unknown[]) => ['isNull', ...args]);
  });

  it('executes once and persists the successful result for a fresh key', async () => {
    const execute = vi.fn().mockResolvedValue({ success: true, claimId: 'claim-1' });

    const result = await runCommercialActionWithIdempotency(claimParams({ execute }));

    expect(result).toEqual({ success: true, claimId: 'claim-1' });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(hoisted.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'claims.submit',
        actorUserId: 'user-1',
        idempotencyKey: 'claim-submit-1',
        tenantId: 'tenant-1',
      })
    );
    expect(hoisted.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        responsePayload: { success: true, claimId: 'claim-1' },
        status: 'completed',
      })
    );
  });

  it('returns the cached response and skips execution when the key already completed', async () => {
    hoisted.returning.mockResolvedValueOnce([]);
    hoisted.selectLimit.mockResolvedValueOnce([
      {
        requestFingerprintHash: 'same-fingerprint',
        responsePayload: { success: true, claimId: 'claim-existing' },
        status: 'completed',
      },
    ]);

    const execute = vi.fn().mockResolvedValue({ success: true, claimId: 'claim-new' });

    const result = await runCommercialActionWithIdempotency(
      claimParams({
        fingerprintHash: 'same-fingerprint',
        execute,
      })
    );

    expect(result).toEqual({ success: true, claimId: 'claim-existing' });
    expect(execute).not.toHaveBeenCalled();
    expectTenantLookup();
  });

  it('rejects a reused key when the payload fingerprint differs', async () => {
    hoisted.returning.mockResolvedValueOnce([]);
    hoisted.selectLimit.mockResolvedValueOnce([
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

  it('releases the reservation when execution throws so the caller can retry', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(runCommercialActionWithIdempotency(claimParams({ execute }))).rejects.toThrow(
      'boom'
    );

    expect(hoisted.deleteWhere).toHaveBeenCalledTimes(1);
    expect(hoisted.deleteWhere).toHaveBeenCalledWith(['eq', 'id_col', 'idem_1']);
  });

  it('releases the reservation when execution returns an explicit failure result', async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ success: false, error: 'Too many requests. Please wait a moment.' });

    const result = await runCommercialActionWithIdempotency(claimParams({ execute }));

    expect(result).toEqual({
      success: false,
      error: 'Too many requests. Please wait a moment.',
    });
    expect(hoisted.deleteWhere).toHaveBeenCalledTimes(1);
    expect(hoisted.deleteWhere).toHaveBeenCalledWith(['eq', 'id_col', 'idem_1']);
    expect(hoisted.updateSet).not.toHaveBeenCalled();
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
    expect(hoisted.insert).not.toHaveBeenCalled();
  });

  it('fails closed on same-key conflicts outside the resolved tenant scope', async () => {
    hoisted.returning.mockResolvedValueOnce([]);
    hoisted.selectLimit.mockResolvedValueOnce([]);

    const execute = vi.fn().mockResolvedValue({ success: true, claimId: 'claim-new' });

    const result = await runCommercialActionWithIdempotency(
      claimParams({
        fingerprintHash: 'same-fingerprint',
        execute,
      })
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
    hoisted.returning.mockResolvedValueOnce([]);
    hoisted.selectLimit.mockResolvedValueOnce([]);

    const execute = vi.fn().mockResolvedValue({ success: true, claimId: 'claim-new' });

    const result = await runCommercialActionWithIdempotency(
      claimParams({
        scope: tenantScope('user-2'),
        fingerprintHash: 'same-fingerprint',
        execute,
      })
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
    const execute = vi.fn().mockResolvedValue({
      success: true,
      data: { claimCategory: 'property' },
    });

    const result = await runCommercialActionWithIdempotency(freeStartParams({ execute }));

    expect(result).toEqual({
      success: true,
      data: { claimCategory: 'property' },
    });
    expect(hoisted.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'free-start.submit',
        actorUserId: null,
        idempotencyKey: 'free-start-1',
        tenantId: null,
      })
    );
  });

  it('uses public null-tenant scope before releasing an allowlisted cached response', async () => {
    hoisted.returning.mockResolvedValueOnce([]);
    hoisted.selectLimit.mockResolvedValueOnce([
      {
        requestFingerprintHash: 'same-fingerprint',
        responsePayload: { success: true, data: { claimCategory: 'property' } },
        status: 'completed',
      },
    ]);

    const result = await runCommercialActionWithIdempotency(
      freeStartParams({
        fingerprintHash: 'same-fingerprint',
        execute: vi.fn(),
      })
    );

    expect(result).toEqual({ success: true, data: { claimCategory: 'property' } });
    expect(hoisted.selectWhere).toHaveBeenCalledWith(
      expect.arrayContaining([
        ['isNull', 'tenant_id_col'],
        ['isNull', 'actor_user_id_col'],
      ])
    );
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
    expect(hoisted.insert).not.toHaveBeenCalled();
  });
});
