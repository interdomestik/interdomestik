import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';

import {
  checkRateVerificationLimitReceipt,
  RateVerificationLimitPrivilegedRoleError,
  setRateVerificationLimit,
} from '../src/scripts/rate-verification-limit';
import {
  withPaymentPortReleaseClient,
  withPrivilegedReleaseLogin,
} from './exchange-rates-release-client.fixture';

export {
  checkRateVerificationLimitReceipt,
  setRateVerificationLimit,
  withPaymentPortReleaseClient,
};

export async function assertReleaseLoginPosture(
  admin: postgres.Sql,
  tenantId: string,
  limit: number
) {
  const operation = {
    tenantId,
    maxAgeSeconds: limit,
    operationId: randomUUID(),
    approvalReference: 'release-login-proof',
    releaseIdentity: 'test-release',
  };
  const assertRefused = async (client: postgres.Sql) => {
    await assert.rejects(
      setRateVerificationLimit(client, operation),
      RateVerificationLimitPrivilegedRoleError
    );
    await assert.rejects(
      checkRateVerificationLimitReceipt(client, operation),
      RateVerificationLimitPrivilegedRoleError
    );
  };
  await withPrivilegedReleaseLogin(admin, 'bypassrls', assertRefused);
  await withPrivilegedReleaseLogin(admin, 'audit-owner-member', assertRefused);
  await withPrivilegedReleaseLogin(admin, 'set-role-bypassrls', assertRefused);
  const [adminPosture] = await admin`select rolsuper, session_user = current_user as same_role
    from pg_roles where rolname = session_user`;
  assert.deepEqual(adminPosture, { rolsuper: true, same_role: true });
  await assertRefused(admin);
  await withPaymentPortReleaseClient(admin, async client => {
    assert.deepEqual(await checkRateVerificationLimitReceipt(client, operation), {
      status: 'absent',
      currentMaxAgeSeconds: limit,
    });
    assert.deepEqual(await setRateVerificationLimit(client, operation), {
      receiptId: operation.operationId,
      priorMaxAgeSeconds: limit,
      maxAgeSeconds: limit,
    });
  });
}
