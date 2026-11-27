import { withPaymentPortDatabase } from '../../../database/test/exchange-rates.fixture';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';

import { saleFixture, success } from '../test/individual-sales/individual-sales.test-support';
import {
  installAgeProbe,
  installCalendarClock,
  probeSaleAge,
} from '../test/individual-sales/rate-age-clock.test-support';
import { ageCandidate, ageViolation } from '../test/individual-sales/rate-age.test-support';

it.runIf(process.env.BILLING_RLS_INTEGRATION === '1')(
  'accepts the exact deadline and refuses one PostgreSQL microsecond later on the deployed age function',
  async () => {
    await withPaymentPortDatabase(async db => {
      await installAgeProbe(db);
      const clock = await installCalendarClock(db);
      const day = '2026-03-24';
      await clock(`${day}T09:00:00+01:00`);
      const f = await saleFixture(db, 3600, false);
      await f.window(day);
      const [rate] = await f.addUnverifiedRate('61.50', day);
      const { evidence } = await ageCandidate(f, rate);
      success(await f.verify(evidence));
      const [{ deadline, after }] = await f.admin<{ deadline: string; after: string }[]>`
        select (verified_at + make_interval(secs => max_age_seconds))::text as deadline,
          (verified_at + make_interval(secs => max_age_seconds) + interval '1 microsecond')::text as after
        from exchange_rate_verifications join exchange_rate_verification_limits using (tenant_id)
        where tenant_id = ${f.tenantId} and operation_key = ${evidence.operationKey}`;
      const accepted = randomUUID();
      const refused = randomUUID();
      expect(await probeSaleAge(f, evidence.rateId, deadline, accepted)).toEqual([
        { id: accepted },
      ]);
      await expect(probeSaleAge(f, evidence.rateId, after, refused)).rejects.toMatchObject(
        ageViolation
      );
      const [{ exact, count }] = await f.admin<{ exact: boolean; count: number }[]>`
        select bool_and(sold_at = ${deadline}::text::timestamptz) as exact, count(*)::int as count
        from wp07_sale_age_probe where id in (${accepted}, ${refused})`;
      expect({ exact, count }).toEqual({ exact: true, count: 1 });
    });
  },
  60000
);
