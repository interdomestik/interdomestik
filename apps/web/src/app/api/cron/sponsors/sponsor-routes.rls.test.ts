// @vitest-environment node

import { it, vi } from 'vitest';

import { withPaymentPortDatabase } from '../../../../../../../packages/database/test/exchange-rates.fixture';
import { seedSponsorScope } from '../../../../../../../packages/database/test/sponsor-test-fixture';
import { verifyHourlyCron, type SendEmail } from './sponsor-hourly-cron.test-support';
import { verifyOptOut } from './sponsor-public-opt-out.test-support';
import {
  addTerm,
  assertRestrictedConnection,
  CRON_BEARER,
  grantSponsorRuntimeAccess,
  LIVE_END,
  LIVE_START,
  NOW,
  ROSTER_SECRET,
} from './sponsor-routes.test-support';

const sendEmail = vi.hoisted(() => vi.fn<SendEmail>());
vi.mock('@interdomestik/domain-communications/email', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/domain-communications/email')>()),
  sendEmail,
}));

it.runIf(process.env.REQUIRE_RLS_INTEGRATION === '1')(
  'runs the hourly sponsor cron and public opt-out handlers under the runtime RLS role',
  async () => {
    const adminUrl = process.env.E2E_DATABASE_URL;
    if (!adminUrl) throw new Error('E2E_DATABASE_URL is required for the sponsor route RLS proof');
    vi.stubEnv('DATABASE_URL', adminUrl);
    vi.stubEnv('CRON_SECRET', CRON_BEARER);
    vi.stubEnv('SPONSOR_ROSTER_SECRET', ROSTER_SECRET);
    try {
      await withPaymentPortDatabase(async ({ admin }) => {
        await grantSponsorRuntimeAccess(admin);
        // The mail adapter admits deployed tenant IDs. The scratch journal seeds MK and KS.
        const scope = await seedSponsorScope(admin, 'tenant_al');
        const liveTerm = await addTerm(admin, scope, LIVE_START, LIVE_END);
        await assertRestrictedConnection(admin, scope);
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        try {
          const otherSponsorEntry = await verifyHourlyCron(admin, scope, liveTerm, sendEmail);
          await verifyOptOut(admin, scope, otherSponsorEntry);
        } finally {
          vi.useRealTimers();
        }
      });
    } finally {
      vi.unstubAllEnvs();
    }
  },
  60_000
);
