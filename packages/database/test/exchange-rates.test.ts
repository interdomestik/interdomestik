import test from 'node:test';

import { proveExchangeRateDatabase } from './exchange-rates-database.proof';
import { withExchangeRateFixture } from './exchange-rates.fixture';
import { scratchServerMissing } from './pg16/scratch-database';

test('WP-07 exchange rates on a journal-built database under the restricted role', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);
  await withExchangeRateFixture(fixture => proveExchangeRateDatabase(t, fixture));
});
