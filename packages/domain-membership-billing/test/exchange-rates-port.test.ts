import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import {
  firstRate,
  insertRate,
  rateInput,
  restricted,
  runSequentially,
  scratchServerMissing,
  withExchangeRateFixture,
  withLockedBook,
  type RateRow,
} from '../../database/test/exchange-rates.fixture';

import { proveExchangeRateAuthorization } from './exchange-rates-authorization.proof';
import {
  createExchangeRatePortFixture,
  type ExchangeRatePortFixture,
} from './exchange-rates-port.fixture';

test('WP-07 exchange rate port on a journal-built database under the restricted role', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);
  await withExchangeRateFixture(async fixture => {
    await provePublications(t, await createExchangeRatePortFixture(fixture));
  });
});

async function provePublications(t: TestContext, fixture: ExchangeRatePortFixture) {
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
  await t.test('refuses publication until the tenant is provisioned with a book', async () => {
    const input = rateInput('2026-01-07');
    assert.deepEqual(await publish(input), { ok: false, code: 'not_found' });
    const { noEntity, withoutBook, createEntity } = fixture;
    assert.deepEqual(
      await port.recordExchangeRate(
        session('tenant_admin', noEntity, noEntity, withoutBook.id),
        input,
        withoutBook
      ),
      { ok: false, code: 'not_found' }
    );
    assert.equal((await bookRows(noEntity)).length, 0);
    await createEntity(admin, tenantId);
    await createEntity(admin, otherTenant);
  });
  const [book] = await bookRows(tenantId);
  assert.ok(book);

  await proveExchangeRateAuthorization(t, fixture);

  await t.test(
    'staff can publish and correct a rate with the migration runtime grants',
    async () => {
      const input = rateInput('2099-11-11');
      const publication = await publish(input);
      assert.ok(publication.ok);
      const correction = await publish({
        ...input,
        rate: '61.75',
        correctsRateId: publication.rate.id,
        correctionReason: 'Corrected bulletin',
      });
      assert.ok(correction.ok);
      assert.equal(correction.rate.revision, 2);
      assert.equal(correction.rate.correctsRateId, publication.rate.id);
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
    'two effective dates across New Year share ISO metadata and have independent chains',
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
      const [first, second] = result;
      assert.ok(first.ok && second.ok);
      for (const publication of [first, second]) {
        assert.equal(publication.rate.weekStartsOn, '2099-12-28');
        assert.equal(publication.rate.revision, 1);
        const [stored] = await restricted(
          admin,
          tenantId,
          tx => tx`
        select stored_at > ${mark}::timestamptz as after_holder from exchange_rates where id = ${publication.rate.id}`
        );
        assert.equal(stored.after_holder, true);
      }
      const earlier = await publish({
        ...rateInput(dates[0]),
        rate: '62.20',
        correctsRateId: first.rate.id,
        correctionReason: 'Official correction',
      });
      assert.ok(earlier.ok);
      assert.equal(earlier.rate.revision, 2);
      const rows = await restricted(
        admin,
        tenantId,
        tx => tx`
      select effective_on::text, revision from exchange_rates
      where tenant_id = ${tenantId} and book_id = ${book.id}
        and week_starts_on = '2099-12-28' order by effective_on, revision`
      );
      assert.deepEqual(
        rows.map(row => [row.effective_on, row.revision]),
        [
          [dates[0], 1],
          [dates[0], 2],
          [dates[1], 1],
        ]
      );
      await assert.rejects(
        restricted(admin, tenantId, tx => insertRate(tx, firstRate(tenantId, book.id, dates[1]))),
        { code: '23505', constraint_name: 'exchange_rates_tenant_book_date_revision_uq' }
      );
    }
  );

  await t.test('same-day staff and scheduled publication yields one winner', async () => {
    const input = rateInput('2100-01-04');
    const { result } = await withLockedBook(
      peer,
      admin,
      tenantId,
      book.id,
      () => Promise.all([publish(input), scheduled({ data: { ...input, tenantId } })]),
      2
    );
    assert.equal(result.filter(row => row.ok).length, 1);
    assert.deepEqual(
      result.find(row => !row.ok),
      { ok: false, code: 'conflict' }
    );
    const [{ count }] = await restricted(
      admin,
      tenantId,
      tx => tx`
      select count(*)::int as count from exchange_rates
      where tenant_id = ${tenantId} and book_id = ${book.id} and effective_on = ${input.effectiveOn}::date`
    );
    assert.equal(count, 1);
  });

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
      await runSequentially(['', ' ', '\t', '\n'], async reason => {
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
      });
      await assert.rejects(
        restricted(admin, tenantId, tx =>
          insertRate(tx, { ...direct, effective_on: '2026-01-24' })
        ),
        { code: '23503', constraint_name: 'exchange_rates_correction_fk' }
      );

      await admin`select pg_sleep(0.005)`;
      const [{ instant: instantText }] = await admin<
        { instant: string }[]
      >`select clock_timestamp()::text as instant`;
      const instant = new Date(instantText);
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
      await assert.rejects(
        restricted(admin, tenantId, tx => insertRate(tx, { ...direct, revision: 3 })),
        { code: '23514', message: 'Exchange rate correction must revise the current rate' }
      );
      assert.deepEqual(await port.getExchangeRateInForce(authority, instant), original);
      const after = new Date(
        Math.max(instant.getTime(), new Date(committed.rate.storedAt).getTime()) + 1
      );
      assert.deepEqual(await port.getExchangeRateInForce(authority, after), committed);
    }
  );
}
