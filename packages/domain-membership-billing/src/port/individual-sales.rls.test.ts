import {
  paymentPortTestSession,
  runtimeRole,
  signal,
  withPaymentPortDatabase,
  type PaymentPortDatabase,
} from '@interdomestik/database/testing/payment-port-rls';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect } from 'vitest';

import { registerCoverageCases } from '../test/individual-sales/individual-sale-coverage.test-support';
import { registerInvariantCases } from '../test/individual-sales/individual-sale-invariants.test-support';
import { registerOfferCases } from '../test/individual-sales/individual-sale-offers.test-support';
import { registerRaceCases } from '../test/individual-sales/individual-sale-races.test-support';
import { registerScopeCases } from '../test/individual-sales/individual-sale-scope.test-support';
import {
  grantSaleFixturePrerequisites,
  saleFixture,
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

      const [{ name }] = await database.admin<
        { name: string }[]
      >`select current_database() as name`;
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

    const fixture = () => saleFixture(database);
    registerOfferCases(fixture);
    registerInvariantCases(fixture);
    registerScopeCases(fixture);
    registerRaceCases(fixture);
    registerCoverageCases(fixture);
  }
);
