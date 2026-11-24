import { restricted, withPaymentPortDatabase } from '../../../database/test/exchange-rates.fixture';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';

import {
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

function publish(f: SaleFixture, effectiveOn: string, rate = '61.50') {
  return f.port.recordExchangeRate(
    f.owner.authority,
    { base: 'EUR', quote: 'MKD', rate, effectiveOn },
    f.owner
  );
}

it.runIf(process.env.BILLING_RLS_INTEGRATION === '1')(
  'verifies the weekly row and probes its age on Sunday and in the following Skopje ISO week',
  async () => {
    await withPaymentPortDatabase(async db => {
      await installAgeProbe(db);
      const clock = await installCalendarClock(db);
      for (const effectiveOn of ['2026-03-23', '2026-03-27']) {
        const f = await saleFixture(db, 36 * 60 * 60);
        await clock(`${effectiveOn}T12:00:00+01:00`);
        const { rate } = success(await publish(f, effectiveOn));
        expect(await publish(f, '2026-03-28', '61.81')).toEqual(refused('conflict'));
        const saturday = '2026-03-28T12:00:00+01:00';
        const sunday = '2026-03-29T12:00:00+02:00';
        const monday = '2026-03-30T12:00:00+02:00';
        for (const [verificationTime, mismatchedValue, saleTime] of [
          [saturday, '61.81', sunday],
          [monday, '62.04', '2026-03-31T12:00:00+02:00'],
        ]) {
          await clock(verificationTime);
          if (verificationTime === monday) {
            success(await publish(f, '2026-04-01', '62.10'));
          }
          const evidence = { ...f.verificationInput(rate.id), sourceRef: `NBRM/${effectiveOn}` };
          expect(await f.verify({ ...evidence, observedRate: mismatchedValue })).toEqual(
            refused('rate_mismatch')
          );
          const [before] = await restricted(
            f.admin,
            f.tenantId,
            tx => tx`
            select count(*)::int as count from exchange_rate_verifications where operation_key = ${evidence.operationKey}`
          );
          expect(before.count).toBe(0);
          expect(success(await f.verify(evidence)).verification.rateEffectiveOn).toBe(effectiveOn);

          // The age probe receives the selected rate and sale time. A real Sunday sale requires
          // a controlled PostgreSQL clock for both offer selection and the 0102 sale stamp.
          const saleId = randomUUID();
          expect(await probeSaleAge(f, rate.id, saleTime, saleId)).toEqual([{ id: saleId }]);
          const [sale] = await f.admin`select sale.rate_id, evidence.rate_effective_on::text,
              evidence.verified_at = ${verificationTime}::text::timestamptz as verification_stamped,
              extract(epoch from (sale.sold_at - evidence.verified_at)) <= 129600 as within_limit,
              extract(epoch from (sale.sold_at - (evidence.rate_effective_on::timestamp at time zone 'Europe/Skopje'))) > 129600 as effective_date_older
            from wp07_sale_age_probe sale join exchange_rate_verifications evidence
              on evidence.rate_id = sale.rate_id
            where sale.id = ${saleId} and evidence.operation_key = ${evidence.operationKey}`;
          expect(sale).toEqual({
            rate_id: rate.id,
            rate_effective_on: effectiveOn,
            verification_stamped: true,
            within_limit: true,
            effective_date_older: true,
          });
        }
      }
    });
  },
  60000
);
