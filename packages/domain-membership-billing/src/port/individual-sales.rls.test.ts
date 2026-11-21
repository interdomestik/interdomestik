import {
  signal,
  withPaymentPortDatabase,
  type PaymentPortDatabase,
} from '@interdomestik/database/testing/payment-port-rls';
import { afterAll, beforeAll, describe } from 'vitest';

import { registerCoverageCases } from './individual-sale-coverage.test-support';
import { registerInvariantCases } from './individual-sale-invariants.test-support';
import { registerOfferCases } from './individual-sale-offers.test-support';
import { registerRaceCases } from './individual-sale-races.test-support';
import { registerScopeCases } from './individual-sale-scope.test-support';
import { grantSaleFixturePrerequisites, saleFixture } from './individual-sales.test-support';

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
