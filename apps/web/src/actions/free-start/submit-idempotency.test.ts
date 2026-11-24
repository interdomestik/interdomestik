import { describe, expect, it } from 'vitest';
import { REQUEST_CASES } from './submit-idempotency-fixtures';
import {
  insertValues,
  selectWhere,
  txEntry,
  updateSet,
} from '@/lib/commercial-action-idempotency-test-support';
import {
  captureFingerprintHash,
  expectOwnTenantStorageOnly,
  installReservationHooks,
  KEY,
  mockRateLimit,
  seedExistingRow,
  storedRow,
  submitVia,
  successDto,
} from './submit-idempotency.test-support';

describe('submitFreeStartIntakeCore keyed reservation adapter', () => {
  installReservationHooks();

  it.each(REQUEST_CASES)(
    'reserves a fresh key in the admitted tenant with a null actor via $name',
    async request => {
      await expect(submitVia(request)).resolves.toEqual(successDto);

      expect(mockRateLimit).toHaveBeenCalledTimes(1);
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'free-start.submit',
          idempotencyKey: KEY,
          tenantId: 'tenant_ks',
          actorUserId: null,
          status: 'pending',
        })
      );
      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({ responsePayload: successDto, status: 'completed' })
      );
      expect(txEntry.insert).toHaveBeenCalledTimes(1);
      expect(txEntry.update).toHaveBeenCalledTimes(1);
      expectOwnTenantStorageOnly(2);
    }
  );

  it.each(REQUEST_CASES)(
    'replays a completed same-fingerprint same-tenant reservation via $name',
    async request => {
      const hash = await captureFingerprintHash();
      const cached = { ...successDto, data: { ...successDto.data, intakeIssue: 'cached_issue' } };
      seedExistingRow(
        storedRow({ request_fingerprint_hash_col: hash, response_payload_col: cached })
      );

      await expect(submitVia(request)).resolves.toEqual(cached);

      expect(mockRateLimit).not.toHaveBeenCalled();
      expect(selectWhere).toHaveBeenCalledWith(
        expect.arrayContaining([
          ['eq', 'tenant_id_col', 'tenant_ks'],
          ['isNull', 'actor_user_id_col'],
        ])
      );
      expect(updateSet).not.toHaveBeenCalled();
      expectOwnTenantStorageOnly(2);
    }
  );
});
