import { test } from '../fixtures/one-door.fixture';
import { proveLegacyCredentialCutover } from './claim-correspondence-cutover.fixture';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe('WP-12.1 MK provider cutover', () => {
  test('storage refuses the legacy upload credential after the verified provider expiry', async ({
    browser,
    door,
  }, info) => {
    test.skip(info.project.name !== 'gate-mk-contract' || process.env.WP12_1_M5_CUTOVER !== '1');
    test.setTimeout(140 * 60 * 1000);
    await proveLegacyCredentialCutover(browser, door, info);
  });
});
