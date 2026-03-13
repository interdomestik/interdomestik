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
  },
  and: vi.fn(),
  eq: vi.fn(),
}));

import { runCommercialActionWithIdempotency } from './commercial-action-idempotency';

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
  });

  it('executes once and persists the successful result for a fresh key', async () => {
    const execute = vi.fn().mockResolvedValue({ success: true, claimId: 'claim-1' });

    const result = await runCommercialActionWithIdempotency({
      action: 'claims.submit',
      actorUserId: 'user-1',
      idempotencyKey: 'claim-submit-1',
      requestFingerprint: { category: 'vehicle', title: 'Damaged bumper' },
      tenantId: 'tenant-1',
      execute,
    });

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

    const result = await runCommercialActionWithIdempotency({
      action: 'claims.submit',
      actorUserId: 'user-1',
      fingerprintHash: 'same-fingerprint',
      idempotencyKey: 'claim-submit-1',
      requestFingerprint: { category: 'vehicle', title: 'Damaged bumper' },
      tenantId: 'tenant-1',
      execute,
    });

    expect(result).toEqual({ success: true, claimId: 'claim-existing' });
    expect(execute).not.toHaveBeenCalled();
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

    const result = await runCommercialActionWithIdempotency({
      action: 'claims.submit',
      actorUserId: 'user-1',
      fingerprintHash: 'different-fingerprint',
      idempotencyKey: 'claim-submit-1',
      requestFingerprint: { category: 'vehicle', title: 'Different payload' },
      tenantId: 'tenant-1',
      execute: vi.fn(),
    });

    expect(result).toEqual({
      success: false,
      error: 'Idempotency key was reused for a different request.',
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
  });

  it('releases the reservation when execution throws so the caller can retry', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(
      runCommercialActionWithIdempotency({
        action: 'claims.submit',
        actorUserId: 'user-1',
        idempotencyKey: 'claim-submit-1',
        requestFingerprint: { category: 'vehicle', title: 'Damaged bumper' },
        tenantId: 'tenant-1',
        execute,
      })
    ).rejects.toThrow('boom');

    expect(hoisted.deleteWhere).toHaveBeenCalledTimes(1);
  });
});
