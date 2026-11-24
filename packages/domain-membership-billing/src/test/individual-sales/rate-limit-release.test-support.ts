import { randomUUID } from 'node:crypto';
import {
  paymentPortTestGuardRole,
  restricted,
  runSequentially,
  waitForLockWaiters,
} from '../../../../database/test/exchange-rates.fixture';
import {
  checkRateVerificationLimitReceipt,
  setRateVerificationLimit,
  withPaymentPortReleaseClient,
} from '../../../../database/test/exchange-rates-release.fixture';
import { expect, it } from 'vitest';

import { directSaleRow, tryInsertDirectSale } from './individual-sale-direct.test-support';
import { holdingSale, race } from './individual-sale-offer-races.test-support';
import {
  absent,
  completed,
  refused,
  success,
  type SaleFixture,
} from './individual-sales.test-support';
import { ageCandidate, assertClosed, type AgeFixture } from './rate-age.test-support';

const receiptAction = 'release.exchange_rate_verification_limit.set';

const applyRelease = (f: SaleFixture, operation: ReturnType<SaleFixture['limitRequest']>) =>
  withPaymentPortReleaseClient(f.admin, release => setRateVerificationLimit(release, operation));

const checkRelease = (f: SaleFixture, operation: ReturnType<SaleFixture['limitRequest']>) =>
  withPaymentPortReleaseClient(f.admin, release =>
    checkRateVerificationLimitReceipt(release, operation)
  );

async function storedLimit(f: SaleFixture, tenant = f.tenantId) {
  const [row] = await restricted(
    f.admin,
    tenant,
    tx =>
      tx<
        { max_age_seconds: number }[]
      >`select max_age_seconds from exchange_rate_verification_limits`
  );
  return row?.max_age_seconds ?? null;
}

async function assertReceipt(
  f: SaleFixture,
  operation: ReturnType<SaleFixture['limitRequest']>,
  prior: number | null
) {
  const [receipt] =
    await f.admin`select id, tenant_id, action, metadata from audit_log where id = ${operation.operationId}`;
  expect(receipt).toEqual({
    id: operation.operationId,
    tenant_id: operation.tenantId,
    action: receiptAction,
    metadata: {
      priorMaxAgeSeconds: prior,
      maxAgeSeconds: operation.maxAgeSeconds,
      approvalReference: operation.approvalReference,
      releaseIdentity: operation.releaseIdentity,
    },
  });
}

export function registerLimitReleaseCases(fixture: AgeFixture) {
  it('sets, changes and removes a limit with committed receipts and tenant isolation', async () => {
    const f = await fixture(null);
    const { input, evidence } = await ageCandidate(f);
    success(await f.verify(evidence));
    await f.entity(undefined, f.otherTenantId);
    await applyRelease(f, f.limitRequest(7200, f.otherTenantId));
    await runSequentially(
      [
        [null, 1],
        [1, 2678400],
        [2678400, null],
      ] as const,
      async ([prior, next]) => {
        const operation = f.limitRequest(next);
        await expect(applyRelease(f, operation)).resolves.toEqual({
          receiptId: operation.operationId,
          priorMaxAgeSeconds: prior,
          maxAgeSeconds: next,
        });
        expect(await storedLimit(f)).toBe(next);
        expect(await storedLimit(f, f.otherTenantId)).toBe(7200);
        await assertReceipt(f, operation, prior);
      }
    );
    await runSequentially([0, 2678401], async invalid => {
      const operation = f.limitRequest(invalid);
      await expect(applyRelease(f, operation)).rejects.toThrow(
        'Invalid rate verification limit operation'
      );
      expect(
        await f.admin`select id from audit_log where id = ${operation.operationId}`
      ).toHaveLength(0);
    });
    await assertClosed(f, input);
  });

  it('enforces the inclusive limit range in SQL under the release login', async () => {
    const f = await fixture(null);
    await withPaymentPortReleaseClient(f.admin, async release => {
      const write = (seconds: number) =>
        release.begin('isolation level read committed', async tx => {
          await tx`set local row_security = on`;
          await tx`select set_config('app.current_tenant_id', ${f.tenantId}, true),
          set_config('app.current_access_tenant_id', ${f.tenantId}, true)`;
          const [book] = await tx`select id from public.exchange_rate_books
          where tenant_id = ${f.tenantId} and base = 'EUR' and quote = 'MKD' for update`;
          expect(book?.id).toBe(f.bookId);
          await tx`insert into public.exchange_rate_verification_limits (tenant_id, max_age_seconds)
          values (${f.tenantId}, ${seconds})
          on conflict (tenant_id) do update set max_age_seconds = excluded.max_age_seconds`;
        });
      await runSequentially([0, 2678401], async seconds => {
        await expect(write(seconds)).rejects.toMatchObject({
          code: '23514',
          constraint_name: 'exchange_rate_verification_limits_max_age_check',
        });
        expect(await storedLimit(f)).toBeNull();
      });
      await runSequentially([1, 2678400], async seconds => {
        await write(seconds);
        expect(await storedLimit(f)).toBe(seconds);
      });
    });
  });

  it('rolls back a valid limit write when the receipt itself fails', async () => {
    const f = await fixture(null);
    const { input, evidence } = await ageCandidate(f);
    success(await f.verify(evidence));
    const operation = { ...f.limitRequest(86400), approvalReference: 'test-reject-receipt' };
    await f.admin`alter table audit_log add constraint wp07_reject_test_receipt
      check (metadata ->> 'approvalReference' is distinct from 'test-reject-receipt')`;
    try {
      await expect(applyRelease(f, operation)).rejects.toMatchObject({
        code: '23514',
        constraint_name: 'wp07_reject_test_receipt',
      });
      await expect(checkRelease(f, operation)).resolves.toEqual({
        status: 'absent',
        currentMaxAgeSeconds: null,
      });
      expect(await storedLimit(f)).toBeNull();
      expect(
        await f.admin`select id from audit_log where id = ${operation.operationId}`
      ).toHaveLength(0);
      await assertClosed(f, input);
    } finally {
      await f.admin`alter table audit_log drop constraint wp07_reject_test_receipt`;
    }
  });

  it('propagates errors when checking a receipt', async () => {
    const f = await fixture(null);
    await withPaymentPortReleaseClient(f.admin, async release => {
      const role = `"${paymentPortTestGuardRole}"`;
      await f.admin.unsafe(`revoke select on public.audit_log from ${role}`);
      try {
        await expect(
          checkRateVerificationLimitReceipt(release, f.limitRequest(86400))
        ).rejects.toMatchObject({ code: '42501' });
      } finally {
        await f.admin.unsafe(`grant select on public.audit_log to ${role}`);
      }
    });
  });

  it('reconciles a lost set acknowledgement from its receipt after a later removal', async () => {
    const f = await fixture(null);
    const { input, evidence } = await ageCandidate(f);
    success(await f.verify(evidence));
    const set = f.limitRequest(86400);
    // Simulate the caller losing the successful operation's acknowledgement.
    await applyRelease(f, set);
    const removal = f.limitRequest(null);
    await applyRelease(f, removal);
    await expect(checkRelease(f, set)).resolves.toEqual({
      status: 'matching',
      receiptId: set.operationId,
      priorMaxAgeSeconds: null,
      maxAgeSeconds: 86400,
    });
    expect(await storedLimit(f)).toBeNull();
    await expect(checkRelease(f, { ...set, maxAgeSeconds: 7200 })).resolves.toEqual({
      status: 'conflict',
      receiptId: set.operationId,
    });
    await expect(checkRelease(f, f.limitRequest(86400))).resolves.toEqual({
      status: 'absent',
      currentMaxAgeSeconds: null,
    });
    expect(await storedLimit(f)).toBeNull();
    await expect(applyRelease(f, set)).resolves.toEqual({
      receiptId: set.operationId,
      priorMaxAgeSeconds: null,
      maxAgeSeconds: 86400,
    });
    await assertReceipt(f, set, null);
    await assertReceipt(f, removal, 86400);
    expect(await storedLimit(f)).toBeNull();
    await assertClosed(f, input);
  });

  it('keeps the 0103 insert closed and reopens only after restoring the limit', async () => {
    const f = await fixture(86400);
    const { input, evidence } = await ageCandidate(f);
    success(await f.verify(evidence));
    const legacyRow = await directSaleRow(f, input);
    await applyRelease(f, f.limitRequest(null));
    // This proves the shared 0103 SQL refusal. The pinned PR-1b sale entry remains a separate proof.
    await restricted(f.admin, f.tenantId, async tx => {
      await tx`savepoint legacy_sale`;
      expect(await tryInsertDirectSale(tx, legacyRow)).toBe('stale_rate');
      await tx`rollback to savepoint legacy_sale`;
      await tx`release savepoint legacy_sale`;
    });
    expect(await f.counts(input.operationKey)).toEqual(absent);
    await assertClosed(f, { ...input, operationKey: randomUUID() });
    success(await f.verify({ ...evidence, operationKey: randomUUID() }));
    const [{ count }] = await f.admin`select count(*)::int as count from exchange_rate_verifications
      where rate_id = ${evidence.rateId} and extract(epoch from (clock_timestamp() - verified_at)) <= 86400`;
    expect(count).toBe(2);
    await assertClosed(f, { ...input, operationKey: randomUUID() });
    await applyRelease(f, f.limitRequest(86400));
    success(await f.quote());
    const reopened = { ...input, operationKey: randomUUID() };
    success(await f.sale(reopened));
    expect(await f.counts(reopened.operationKey)).toEqual(completed);
  });

  it('refuses a waiting sale after the release removal and receipt commit', async () => {
    const f = await fixture();
    const { input, evidence } = await ageCandidate(f);
    success(await f.verify(evidence));
    const removal = f.limitRequest(null);
    const outcomes = await withPaymentPortReleaseClient(f.admin, release =>
      race(
        f,
        hold =>
          f.peer.begin(async tx => {
            const [{ pid }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
            await tx`select tenant_id from exchange_rate_verification_limits where tenant_id = ${f.tenantId} for update`;
            await hold(pid);
          }),
        async blocker => {
          const writer = setRateVerificationLimit(release, removal);
          try {
            await Promise.race([
              waitForLockWaiters(f.admin, blocker, 1),
              writer.then(() => {
                throw new Error('Removal bypassed the held limit row');
              }),
            ]);
            const sale = await f.sale(input);
            expect((await writer).receiptId).toBe(removal.operationId);
            return sale;
          } finally {
            await Promise.allSettled([writer]);
          }
        },
        { waiters: 2 }
      )
    );
    expect(outcomes.second).toEqual(refused('stale_rate'));
    await assertReceipt(f, removal, 86400);
    expect(await f.counts(input.operationKey)).toEqual(absent);
  }, 15000);

  it('commits a sale holding the shared book lock before the release removal', async () => {
    const f = await fixture();
    const { input, evidence } = await ageCandidate(f);
    success(await f.verify(evidence));
    const removal = f.limitRequest(null);
    const result = await withPaymentPortReleaseClient(f.admin, release =>
      race(f, holdingSale(f, input), () => setRateVerificationLimit(release, removal))
    );
    expect(result.second.receiptId).toBe(removal.operationId);
    expect(await f.counts(input.operationKey)).toEqual(completed);
    await assertReceipt(f, removal, 86400);
    await assertClosed(f, { ...input, operationKey: randomUUID() });
  }, 15000);
}
