import { describe, expect, it } from 'vitest';
import { viaEachRequest } from './submit-idempotency-fixtures';
import {
  deleteWhere,
  txEntry,
  updateSet,
  withTenantContextMock,
} from '@/lib/commercial-action-idempotency-test-support';
import {
  captureFingerprintHash,
  expectOwnTenantStorageOnly,
  FOREIGN_PAYLOAD,
  installReservationHooks,
  mockCaptureException,
  mockRateLimit,
  seedExistingRow,
  storedRow,
  submit,
  submitVia,
  successDto,
  validInput,
} from './submit-idempotency.test-support';

describe('submitFreeStartIntakeCore keyed reservation adapter', () => {
  installReservationHooks();

  it.each(
    viaEachRequest([
      {
        name: 'a changed-fingerprint',
        row: { request_fingerprint_hash_col: 'changed-hash' },
        code: 'IDEMPOTENCY_KEY_REUSED',
      },
      {
        name: 'a pending same-fingerprint',
        row: { status_col: 'pending', response_payload_col: {} },
        code: 'IDEMPOTENCY_IN_PROGRESS',
      },
    ])
  )(
    'neither executes nor releases payload for $name reservation via $via',
    async ({ row, code, request }) => {
      const hash = await captureFingerprintHash();
      seedExistingRow(storedRow({ request_fingerprint_hash_col: hash, ...row }));

      const result = await submitVia(request);

      expect(result).toEqual(expect.objectContaining({ success: false, code }));
      expect(result).not.toHaveProperty('data');
      expect(mockRateLimit).not.toHaveBeenCalled();
      expect(updateSet).not.toHaveBeenCalled();
      expect(deleteWhere).not.toHaveBeenCalled();
      expectOwnTenantStorageOnly(2);
    }
  );

  it.each(
    viaEachRequest([
      { name: 'foreign MK-tenant', foreign: { tenant_id_col: 'tenant_mk' } },
      { name: 'foreign AL-tenant', foreign: { tenant_id_col: 'tenant_al' } },
      { name: 'foreign pilot-tenant', foreign: { tenant_id_col: 'pilot-mk' } },
      { name: 'foreign-actor', foreign: { actor_user_id_col: 'user-foreign' } },
      { name: 'legacy null-tenant public', foreign: { tenant_id_col: null } },
    ])
  )(
    'fails closed on a $name reservation holding the global key via $via',
    async ({ foreign, request }) => {
      const hash = await captureFingerprintHash();
      const row = storedRow({ request_fingerprint_hash_col: hash, ...foreign });
      seedExistingRow({ ...row, response_payload_col: FOREIGN_PAYLOAD });

      await expect(submitVia(request)).resolves.toEqual({
        success: false,
        error: 'Idempotency key is already reserved for a different scope.',
        code: 'IDEMPOTENCY_SCOPE_CONFLICT',
      });

      expect(mockRateLimit).not.toHaveBeenCalled();
      expect(updateSet).not.toHaveBeenCalled();
      expect(deleteWhere).not.toHaveBeenCalled();
      expectOwnTenantStorageOnly(2);
    }
  );

  it.each([
    { name: 'rate-limit', limited: true, data: validInput, code: 'RATE_LIMITED' },
    {
      name: 'validation',
      limited: false,
      data: { ...validInput, category: 'vehicle' as const },
      code: 'INVALID_PAYLOAD',
    },
  ])(
    'releases only its own reservation on an explicit $name failure',
    async ({ limited, data, code }) => {
      mockRateLimit.mockResolvedValueOnce({ limited });

      await expect(submit({ data })).resolves.toMatchObject({ success: false, code });

      expect(txEntry.delete).toHaveBeenCalledTimes(1);
      expect(deleteWhere).toHaveBeenCalledWith(['eq', 'id_col', 'idem_1']);
      expect(updateSet).not.toHaveBeenCalled();
      expectOwnTenantStorageOnly(2);
    }
  );

  it('releases only its own reservation when execution throws', async () => {
    const failure = new Error('limiter unavailable');
    mockRateLimit.mockRejectedValueOnce(failure);

    await expect(submit()).resolves.toEqual({
      success: false,
      error: 'Internal Server Error',
      code: 'INTERNAL_SERVER_ERROR',
    });

    expect(deleteWhere).toHaveBeenCalledWith(['eq', 'id_col', 'idem_1']);
    expect(updateSet).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({
        tags: { action: 'submitFreeStartIntake', feature: 'free-start' },
      })
    );
    expectOwnTenantStorageOnly(2);
  });

  it('bypasses reservation storage entirely without an idempotency key', async () => {
    await expect(submit({ idempotencyKey: undefined })).resolves.toEqual(successDto);

    expect(mockRateLimit).toHaveBeenCalledTimes(1);
    expect(withTenantContextMock).not.toHaveBeenCalled();
    expect(txEntry.insert).not.toHaveBeenCalled();
    expectOwnTenantStorageOnly(0);
  });
});
