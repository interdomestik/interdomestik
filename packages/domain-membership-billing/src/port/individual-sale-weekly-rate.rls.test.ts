import {
  restricted,
  signal,
  withPaymentPortDatabase,
  type PaymentPortDatabase,
} from '../../../database/test/exchange-rates.fixture';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  directSaleRow,
  insertDirectSale,
} from '../test/individual-sales/individual-sale-direct.test-support';
import { saleScope } from '../test/individual-sales/individual-sale-offer-races.test-support';
import {
  absent,
  accepted,
  completed,
  refused,
  saleFixture,
  success,
  type SaleFixture,
} from '../test/individual-sales/individual-sales.test-support';
import {
  installAgeProbe,
  installCalendarClock,
  probeSaleAge,
} from '../test/individual-sales/rate-age-clock.test-support';
import { ageViolation, assertClosed } from '../test/individual-sales/rate-age.test-support';
import type { SaleInput } from './sale-input';

async function allPathsClosed(f: SaleFixture, input: SaleInput) {
  await assertClosed(f, input);
  const row = await directSaleRow(f, input, { deriveDueOn: true });
  await expect(
    restricted(f.peer, f.tenantId, tx => insertDirectSale(tx, row))
  ).rejects.toMatchObject(ageViolation);
  expect(await f.counts(input.operationKey)).toEqual(absent);
}

async function replay(f: SaleFixture, input: SaleInput, original: unknown) {
  const { recordSaleInTx } = await import('../payment-port-compose');
  expect(await f.sale(input)).toEqual(original);
  await saleScope(f, f.owner, async tx => {
    expect(await recordSaleInTx(tx, f.owner.authority, input, f.owner)).toEqual(original);
  });
  expect(await f.counts(input.operationKey)).toEqual(completed);
}

describe.runIf(process.env.BILLING_RLS_INTEGRATION === '1')(
  'PG16 official sale-day pricing',
  () => {
    const finish = signal();
    let running: Promise<void>;
    let db: PaymentPortDatabase;
    let clock: Awaited<ReturnType<typeof installCalendarClock>>;

    beforeAll(async () => {
      const ready = signal();
      running = withPaymentPortDatabase(async database => {
        db = database;
        await installAgeProbe(db);
        clock = await installCalendarClock(db);
        ready.resolve();
        await finish.promise;
      });
      await Promise.race([ready.promise, running]);
    }, 60000);

    afterAll(async () => {
      finish.resolve();
      await running;
    });

    it('keeps Monday’s exact snapshot and admits Tuesday only after Tuesday’s check', async () => {
      const f = await saleFixture(db, 86400, false);
      await f.window('2026-03-23');
      await f.window('2026-03-24');
      await clock('2026-03-23T22:59:58Z');
      success(await f.publish());
      const [monday] = await f.addRate('61.50', '2026-03-23');
      const mondayEvidence =
        await f.admin`select check_id, operation_key from exchange_rate_verifications where rate_id = ${monday.id}`;
      const initialInput = accepted(await f.offer(), { memberUserId: f.member.id });
      expect(initialInput.amountMkdMinor).toBe(61500n);
      await clock('2026-03-23T22:59:59Z');
      const original = success(await f.sale(initialInput));
      expect(original.sale).toMatchObject({
        rateId: monday.id,
        amountMkdMinor: 61500n,
        soldOn: '2026-03-23',
      });
      const fresh = { ...initialInput, operationKey: randomUUID() };

      await clock('2026-03-23T23:00:00Z'); // Tuesday in Skopje.
      await allPathsClosed(f, fresh);
      await replay(f, initialInput, original);
      const priorCheck = success(await f.begin()).check;
      const oldRequest = f.verificationInput(monday.id, '61.50', priorCheck.id);
      expect(await f.verify(oldRequest)).toEqual(refused('stale_rate'));
      await expect(
        restricted(
          f.peer,
          f.tenantId,
          tx => tx`
        insert into exchange_rate_verifications (id, tenant_id, legal_entity_id, book_id, rate_id, base, quote,
          rate_effective_on, observed_rate, source_ref, verified_by, operation_key, check_id)
        values (${randomUUID()}, ${f.tenantId}, ${f.legalEntityId}, ${f.bookId}, ${monday.id}, 'EUR', 'MKD',
          '2026-03-23', 61.50, 'NBRM/monday', ${f.owner.id}, ${randomUUID()}, ${priorCheck.id})
      `
        )
      ).rejects.toMatchObject({
        code: '23514',
        constraint_name: 'exchange_rate_verifications_current_rate',
      });
      expect(
        success(
          await f.verify({
            ...oldRequest,
            checkId: mondayEvidence[0].check_id,
            operationKey: mondayEvidence[0].operation_key,
          })
        ).verification.rateId
      ).toBe(monday.id);

      const [tuesday] = await f.addUnverifiedRate('62.20', '2026-03-24');
      expect(tuesday).toMatchObject({ revision: 1, week_starts_on: monday.week_starts_on });
      const tuesdayBuyer = await f.addUser('member', f.homeBranch);
      const tuesdayInput = {
        ...fresh,
        buyer: { memberUserId: tuesdayBuyer.id },
        rateId: tuesday.id,
        amountMkdMinor: 62200n,
      };
      await allPathsClosed(f, tuesdayInput);
      await replay(f, initialInput, original);
      success(
        await f.close({
          ...f.checkInput(),
          checkId: priorCheck.id,
          reason: 'No Tuesday bulletin yet',
        })
      );
      success(await f.verify(await f.newEvidence(tuesday.id, '62.20')));
      expect(success(await f.quote()).offer).toMatchObject({
        rateId: tuesday.id,
        amountMkdMinor: 62200n,
      });
      expect(success(await f.sale(tuesdayInput)).sale).toMatchObject({
        rateId: tuesday.id,
        amountMkdMinor: 62200n,
      });
      expect(await f.counts(tuesdayInput.operationKey)).toEqual(completed);
      await replay(f, initialInput, original);
    }, 60000);

    it('closes at check start, persists mismatch, and reopens only on a checked replacement', async () => {
      const f = await saleFixture(db, 86400, false);
      await f.window('2026-03-24');
      await clock('2026-03-24T09:00:00+01:00');
      success(await f.publish());
      const [rate] = await f.addRate('61.50', '2026-03-24');
      const initial = accepted(await f.offer(), { memberUserId: f.member.id });
      const original = success(await f.sale(initial));
      const fresh = { ...initial, operationKey: randomUUID() };
      await clock('2026-03-24T10:00:00+01:00');
      const begin = f.checkInput();
      const start = success(await f.begin(begin));
      await allPathsClosed(f, fresh);
      await replay(f, initial, original);
      expect(await f.begin()).toEqual(refused('conflict'));
      const mismatch = f.verificationInput(rate.id, '62.20', start.check.id);
      const negative = await f.verify(mismatch);
      expect(negative).toMatchObject({
        ...refused('rate_mismatch'),
        receipt: { checkId: start.check.id, rateId: rate.id },
      });
      expect(await f.verify(mismatch)).toEqual(negative);
      expect(await f.verify({ ...mismatch, sourceRef: 'NBRM/changed' })).toEqual(
        refused('conflict')
      );
      expect(await f.begin(begin)).toEqual(start);
      await allPathsClosed(f, fresh);
      const substitute = await f.addUser('admin', null);
      const later = success(await f.begin()).check;
      success(
        await f.close(
          { ...f.checkInput(), checkId: later.id, reason: 'Bulletin unavailable' },
          substitute
        )
      );
      await allPathsClosed(f, fresh);
      expect(await f.verify(f.verificationInput(rate.id, '61.50', later.id))).toEqual(
        refused('conflict')
      );
      const disputed = await f.newEvidence(rate.id);
      expect(await f.verify(disputed)).toEqual(refused('stale_rate'));
      success(
        await f.close(
          { ...f.checkInput(), checkId: disputed.checkId, reason: 'Rate still disputed' },
          substitute
        )
      );

      const replacement = await f.correctRate(rate, '62.20');
      const updated = { ...fresh, rateId: replacement.id, amountMkdMinor: 62200n };
      await allPathsClosed(f, updated);
      success(await f.verify(await f.newEvidence(replacement.id, '62.20')));
      expect(success(await f.sale(updated)).sale.rateId).toBe(replacement.id);
      expect(await f.counts(updated.operationKey)).toEqual(completed);
      await replay(f, initial, original);
    }, 60000);

    it('closes an unchecked window at its exclusive deadline across Skopje’s DST transition', async () => {
      const f = await saleFixture(db, 86400, false);
      const sunday = '2026-03-29';
      const deadline = '2026-03-29T03:00:00+02:00'; // First instant after the DST jump.
      await f.window(sunday, undefined, deadline);
      await f.window(sunday, deadline, '2026-03-29T04:00:00+02:00');
      await clock('2026-03-29T01:30:00+01:00');
      success(await f.publish());
      const [rate] = await f.addRate('61.50', sunday);
      await f.addUnverifiedRate('70.00', '2026-03-30');
      const initial = accepted(await f.offer(), { memberUserId: f.member.id });
      const original = success(await f.sale(initial));
      const fresh = { ...initial, operationKey: randomUUID() };
      expect(await probeSaleAge(f, rate.id, '2026-03-29T01:59:59.999999+01:00')).toHaveLength(1);
      await expect(probeSaleAge(f, rate.id, deadline)).rejects.toMatchObject(ageViolation);
      await clock(deadline);
      await allPathsClosed(f, fresh); // No verifier started the second window.
      const abandoned = await f.newEvidence(rate.id);
      await allPathsClosed(f, fresh); // Verifier crashed after begin committed.
      await clock('2026-03-29T04:00:00+02:00');
      expect(await f.verify(abandoned)).toEqual(refused('stale_rate'));
      await allPathsClosed(f, fresh);
      success(
        await f.close({
          ...f.checkInput(),
          checkId: abandoned.checkId,
          reason: 'Abandoned at deadline',
        })
      );
      expect(await f.begin()).toEqual(refused('stale_rate'));
      await replay(f, initial, original);
    }, 60000);
  }
);
