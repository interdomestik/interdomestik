import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';

import { restricted, runSequentially, type ExchangeRateFixture } from './exchange-rates.fixture';
import { quoteIdentifier, TEST_DB_ROLE } from './rls-test-connection';

export async function proveVerificationMutationDenials(
  t: TestContext,
  fixture: ExchangeRateFixture
) {
  const { admin, tenantId } = fixture;

  await t.test('runtime cannot mutate evidence or limits', async () => {
    const statements = [
      'update public.exchange_rate_verifications set source_ref = source_ref',
      'delete from public.exchange_rate_verifications',
      'truncate public.exchange_rate_verifications',
      'insert into public.exchange_rate_verification_limits select tenant_id, max_age_seconds from public.exchange_rate_verification_limits',
      'update public.exchange_rate_verification_limits set max_age_seconds = 1',
      'delete from public.exchange_rate_verification_limits',
      'truncate public.exchange_rate_verification_limits',
    ];
    await runSequentially(statements, statement =>
      assert.rejects(
        restricted(admin, tenantId, tx => tx.unsafe(statement)),
        { code: '42501' }
      )
    );
  });

  await t.test('the append-only trigger refuses mutations with the scratch ACL', async () => {
    const scratchRole = quoteIdentifier(TEST_DB_ROLE);
    await admin.unsafe(
      `grant select, update, delete, truncate on public.exchange_rate_verifications to ${scratchRole}`
    );
    const rows = () =>
      restricted(
        admin,
        tenantId,
        async tx => [...(await tx`select * from public.exchange_rate_verifications`)],
        TEST_DB_ROLE
      );
    const before = await rows();
    assert.equal(before.length, 1);
    const statements = [
      'update public.exchange_rate_verifications set source_ref = source_ref',
      'delete from public.exchange_rate_verifications',
      'truncate public.exchange_rate_verifications',
    ];
    await runSequentially(statements, statement =>
      assert.rejects(
        restricted(admin, tenantId, tx => tx.unsafe(statement), TEST_DB_ROLE),
        {
          code: '23514',
          message: 'exchange_rate_verifications is append-only',
        }
      )
    );
    assert.deepEqual(await rows(), before);
  });
}
