import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';

import { mintIngressCapability } from '../src/ingress-capability';
import { mintTenantAuthority } from '../src/tenant-authority';
import { proveExchangeRateDatabase } from './exchange-rates-database.proof';
import {
  firstRate,
  insertRate,
  rateInput,
  restricted,
  withExchangeRateFixture,
  withLockedBook,
  type ExchangeRateFixture,
  type RateRow,
} from './exchange-rates.fixture';
import { scratchServerMissing } from './pg16/scratch-database';

test('WP-07 exchange rates on a journal-built database under the restricted role', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);

  await withExchangeRateFixture(async fixture => {
    await proveExchangeRateDatabase(t, fixture);
    await provePublications(t, fixture);
  });
});

async function provePublications(t: TestContext, fixture: ExchangeRateFixture) {
  const {
    admin,
    peer,
    port,
    tenantId,
    otherTenant,
    actor,
    session,
    authority,
    scheduled,
    publish,
    bookRows,
  } = fixture;
  const [book] = await bookRows(tenantId);
  assert.ok(book);

  await t.test(
    'denies wrong staff and scheduled authorities and every identity injection',
    async () => {
      const input = rateInput('2026-02-04');
      for (const denied of [
        session('member'),
        session('agent'),
        session('staff'),
        session('tenant_admin', otherTenant),
        session('tenant_admin', tenantId, otherTenant),
        session('tenant_admin', tenantId, tenantId, randomUUID()),
      ]) {
        assert.deepEqual(await port.recordExchangeRate(denied, input, actor), {
          ok: false,
          code: 'forbidden',
        });
      }
      for (const field of ['storedBy', 'callerKind', 'tenantId', 'stored_by', 'caller_kind']) {
        assert.deepEqual(await publish({ ...input, [field]: 'injected' }), {
          ok: false,
          code: 'invalid',
        });
      }
      const scheduledInput = { ...input, tenantId };
      for (const field of [
        'storedBy',
        'callerKind',
        'stored_by',
        'caller_kind',
        'correctsRateId',
        'correctionReason',
      ]) {
        assert.deepEqual(await scheduled({ data: { ...scheduledInput, [field]: 'injected' } }), {
          ok: false,
          code: 'invalid',
        });
      }
      for (const capability of [
        mintIngressCapability('cron'),
        mintTenantAuthority({ tenantId, purpose: 'scheduled-work' }),
        authority,
      ]) {
        assert.deepEqual(
          await port.recordExchangeRateScheduled(capability as never, scheduledInput),
          { ok: false, code: 'forbidden' }
        );
      }
      for (const deniedTenant of ['', '  ', `unknown_${randomUUID()}`]) {
        assert.deepEqual(await scheduled({ data: { ...input, tenantId: deniedTenant } }), {
          ok: false,
          code: 'forbidden',
        });
      }
      assert.deepEqual(
        await restricted(admin, tenantId, async tx => [
          ...(await tx`select id from exchange_rates where effective_on = ${input.effectiveOn}`),
        ]),
        []
      );
    }
  );

  await t.test(
    'staff and scheduled publications commit with their intended actor and effective day',
    async () => {
      const staff = await publish(rateInput('2099-12-23'));
      const job = await scheduled({ data: { ...rateInput('2100-01-13'), tenantId } });
      assert.ok(staff.ok && job.ok);
      const visible = await restricted(admin, tenantId, async tx => [
        ...(await tx<RateRow[]>`
    select id, caller_kind, stored_by, effective_on::text, week_starts_on::text, revision, corrects_rate_id
    from exchange_rates where id in (${staff.rate.id}, ${job.rate.id}) order by effective_on`),
      ]);
      assert.deepEqual(
        visible.map(row => [row.caller_kind, row.stored_by, row.effective_on, row.revision]),
        [
          ['staff', actor.id, '2099-12-23', 1],
          ['inngest', null, '2100-01-13', 1],
        ]
      );
    }
  );

  await t.test(
    'week identity across New Year serializes staff and scheduled publications',
    async () => {
      const dates = ['2099-12-31', '2100-01-02'];
      const { mark, result } = await withLockedBook(
        peer,
        admin,
        tenantId,
        book.id,
        () =>
          Promise.all([
            publish(rateInput(dates[0])),
            scheduled({ data: { ...rateInput(dates[1]), tenantId } }),
          ]),
        2
      );
      const winners = result.flatMap(row => (row.ok ? [row.rate] : []));
      assert.equal(winners.length, 1);
      assert.deepEqual(
        result.find(row => !row.ok),
        { ok: false, code: 'conflict' }
      );
      const [winner] = winners;
      assert.equal(winner.weekStartsOn, '2099-12-28');
      assert.ok(dates.includes(winner.effectiveOn));
      const [stored] = await restricted(
        admin,
        tenantId,
        tx => tx`
    select stored_at > ${mark}::timestamptz as after_holder from exchange_rates where id = ${winner.id}`
      );
      assert.equal(
        stored.after_holder,
        true,
        'storage time follows the blocker releasing the book at commit'
      );
      const alternateDate = dates.find(date => date !== winner.effectiveOn);
      assert.ok(alternateDate);
      await assert.rejects(
        restricted(admin, tenantId, tx =>
          insertRate(tx, firstRate(tenantId, book.id, alternateDate))
        ),
        { code: '23505', constraint_name: 'exchange_rates_tenant_book_week_revision_uq' }
      );
    }
  );

  await t.test(
    'successive weeks take effect on their actual Skopje dates at local midnight',
    async () => {
      const first = await publish(rateInput('2100-02-03'));
      const second = await scheduled({ data: { ...rateInput('2100-02-10'), tenantId } });
      assert.ok(first.ok && second.ok);
      const at = (instant: string) => port.getExchangeRateInForce(authority, new Date(instant));
      assert.deepEqual(await at('1900-01-01T00:00:00.000Z'), {
        ok: false,
        code: 'rate_unavailable',
      });
      assert.deepEqual(await at('2100-02-02T23:00:00.000Z'), first);
      assert.deepEqual(await at('2100-02-09T22:59:59.999Z'), first);
      assert.deepEqual(await at('2100-02-09T23:00:00.000Z'), second);
    }
  );

  await t.test(
    'corrections must revise the current row, keep its actual date and carry a reason',
    async () => {
      const original = await publish(rateInput('2026-01-25'));
      assert.ok(original.ok);
      const input = {
        ...rateInput(original.rate.effectiveOn),
        correctsRateId: original.rate.id,
        correctionReason: 'Corrected bulletin',
      };
      const scheduledCorrection = { ...input, tenantId };
      assert.deepEqual(await scheduled({ data: scheduledCorrection }), {
        ok: false,
        code: 'invalid',
      });
      const direct = {
        ...firstRate(tenantId, book.id, input.effectiveOn),
        caller_kind: 'staff',
        stored_by: actor.id,
        revision: 2,
        corrects_rate_id: original.rate.id,
        correction_reason: input.correctionReason,
      };
      for (const reason of ['', ' ', '\t', '\n']) {
        assert.deepEqual(await publish({ ...input, correctionReason: reason }), {
          ok: false,
          code: 'invalid',
        });
        await assert.rejects(
          restricted(admin, tenantId, tx =>
            insertRate(tx, { ...direct, correction_reason: reason })
          ),
          { code: '23514', constraint_name: 'exchange_rates_correction_reason_check' }
        );
      }
      await assert.rejects(
        restricted(admin, tenantId, tx =>
          insertRate(tx, { ...direct, effective_on: '2026-01-24' })
        ),
        { code: '23503', constraint_name: 'exchange_rates_correction_fk' }
      );

      await admin`select pg_sleep(0.005)`;
      const [{ instant }] = await admin<{ instant: Date }[]>`select clock_timestamp() as instant`;
      const { result } = await withLockedBook(
        peer,
        admin,
        tenantId,
        book.id,
        () =>
          Promise.all([publish({ ...input, rate: '61.6' }), publish({ ...input, rate: '61.7' })]),
        2
      );
      const outcomes = result.filter(row => row.ok);
      assert.equal(outcomes.length, 1);
      assert.deepEqual(
        result.find(row => !row.ok),
        { ok: false, code: 'conflict' }
      );
      const [committed] = outcomes;
      assert.ok(committed.ok);
      const [row] = await restricted(
        admin,
        tenantId,
        tx => tx<RateRow[]>`
    select caller_kind, stored_by, effective_on::text, revision, corrects_rate_id from exchange_rates where id = ${committed.rate.id}`
      );
      assert.deepEqual(row, {
        caller_kind: 'staff',
        stored_by: actor.id,
        effective_on: input.effectiveOn,
        revision: 2,
        corrects_rate_id: original.rate.id,
      });
      assert.deepEqual(await publish(input), { ok: false, code: 'conflict' });
      assert.deepEqual(await port.getExchangeRateInForce(authority, instant), original);
      const after = new Date(
        Math.max(instant.getTime(), new Date(committed.rate.storedAt).getTime()) + 1
      );
      assert.deepEqual(await port.getExchangeRateInForce(authority, after), committed);
    }
  );
}
