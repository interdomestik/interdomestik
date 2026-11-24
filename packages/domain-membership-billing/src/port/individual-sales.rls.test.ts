import {
  paymentPortTestSession,
  restricted,
  runSequentially,
  runtimeRole,
  signal,
  withPaymentPortDatabase,
  type PaymentPortDatabase,
} from '../../../database/test/exchange-rates.fixture';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerClaimErrorCases } from '../test/individual-sales/individual-sale-claim-errors.test-support';
import { registerCoverageCases } from '../test/individual-sales/individual-sale-coverage.test-support';
import {
  directSaleRow,
  insertDirectSale,
} from '../test/individual-sales/individual-sale-direct.test-support';
import { registerInvariantCases } from '../test/individual-sales/individual-sale-invariants.test-support';
import { registerOfferCases } from '../test/individual-sales/individual-sale-offers.test-support';
import { registerRaceCases } from '../test/individual-sales/individual-sale-races.test-support';
import { registerScopeCases } from '../test/individual-sales/individual-sale-scope.test-support';
import { registerRateAgeCases } from '../test/individual-sales/rate-age.test-support';
import { registerRateAgeRaceCases } from '../test/individual-sales/rate-age-races.test-support';
import { registerLimitReleaseCases } from '../test/individual-sales/rate-limit-release.test-support';
import { registerVerificationCases } from '../test/individual-sales/rate-verification.test-support';
import {
  absent,
  accepted,
  grantSaleFixturePrerequisites,
  refused,
  saleFixture,
  success,
} from '../test/individual-sales/individual-sales.test-support';

describe.runIf(process.env.BILLING_RLS_INTEGRATION === '1')(
  'individual sales with the restricted database role',
  () => {
    let database: PaymentPortDatabase;
    let running: Promise<void> | undefined;
    const release = signal();

    beforeAll(async () => {
      const ready = signal();
      running = withPaymentPortDatabase(async db => {
        await grantSaleFixturePrerequisites(db);
        database = db;
        ready.resolve();
        await release.promise;
      });
      await Promise.race([ready.promise, running]);

      const [{ name, version }] = await database.admin<{ name: string; version: string }[]>`
        select current_database() as name, current_setting('server_version_num') as version`;
      expect(name).toMatch(/^wp07_payment_/u);
      expect(Math.floor(Number(version) / 10000)).toBe(16);
      const { withTenantAuthority } =
        await import('@interdomestik/database/tenant-authority-context');
      const authority = paymentPortTestSession(randomUUID(), randomUUID(), 'tenant_admin');
      await withTenantAuthority(authority, async tx => {
        const [connection] = await tx.execute<{ name: string; role: string }>(
          sql`select current_database() as name, current_user as role`
        );
        expect(connection).toEqual({ name, role: runtimeRole });
      });
    }, 60_000);

    afterAll(async () => {
      release.resolve();
      await running;
    });

    const fixture = (maxAgeSeconds?: number | null) => saleFixture(database, maxAgeSeconds);

    it('publishes only eligible catalogue values and keeps the exact stored price per plan', async () => {
      const f = await fixture();
      await runSequentially(
        [
          { tier: 'family' },
          { interval: 'month' },
          { currency: 'MKD' },
          { price: '0.00' },
          { price: '-0.01' },
          { active: false },
        ],
        async fields => {
          const planId = await f.plan(fields);
          expect(await f.publish({ planId, legalEntityId: f.legalEntityId })).toEqual(
            refused('invalid')
          );
        }
      );
      const prices = ['1.07', '999999.99'] as const;
      await runSequentially([...prices.entries()], async ([index, price]) => {
        const planId = await f.plan({ price });
        const { version } = success(await f.publish({ planId, legalEntityId: f.legalEntityId }));
        expect(version.listPriceMinor).toBe([107n, 99999999n][index]);
        expect(version.publishedBy).toBe(f.owner.id);
        expect(version.version).toBe(1);
      });

      const business = await f.plan({ tier: 'business', price: '90.00' });
      const { version } = success(
        await f.publish({ planId: business, legalEntityId: f.legalEntityId })
      );
      expect(version.tier).toBe('business');
      expect(await f.quote(business)).toEqual(refused('stale_offer'));
      const offer = await f.sellable();
      const input = {
        ...accepted(offer, { memberUserId: f.member.id }),
        planVersionId: version.id,
      };
      expect(await f.sale(input)).toEqual(refused('stale_offer'));
      const row = await directSaleRow(f, input);
      await expect(
        restricted(f.admin, f.tenantId, tx => insertDirectSale(tx, row))
      ).rejects.toMatchObject({ code: '23514', constraint_name: 'membership_sales_stale_offer' });
      expect(await f.counts(input.operationKey)).toEqual(absent);
    });

    registerOfferCases(fixture);
    registerClaimErrorCases(fixture);
    registerInvariantCases(fixture);
    registerScopeCases(fixture);
    registerRaceCases(fixture);
    registerCoverageCases(fixture);
    registerVerificationCases(fixture);
    registerRateAgeCases(fixture);
    registerRateAgeRaceCases(fixture);
    registerLimitReleaseCases(fixture);
  }
);
