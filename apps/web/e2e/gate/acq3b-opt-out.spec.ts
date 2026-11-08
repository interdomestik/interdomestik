import { optOutToken } from '@interdomestik/domain-membership-billing/sponsors/roster-crypto';
import { expect, test } from '../fixtures/auth.fixture';
import { path as routePath } from '../fixtures/routes';
import { gotoApp } from '../utils/navigation';
import { withFreshPage } from './test/login-handoff-page';
import { rosterSecret, withSponsorFixture } from './acq3b-context.fixture';
import { readEntry, seedEntry, seedSponsor, seedTerm } from './acq3b-seed.fixture';
import { copy, dismissCookies, locales, tabTo, visible } from './acq3b-ui.fixture';

// The URL contains a bearer opt-out token; never retain it in traces or screenshots.
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test.describe('ACQ-3b public opt-out', () => {
  for (const locale of locales) {
    test(`${locale}: GET is inert; confirmation announces and focuses completion`, async ({
      browser,
    }, info) => {
      test.skip(
        info.project.name !== 'gate-ks-sq',
        'One tenant host; four catalog-backed languages.'
      );
      test.setTimeout(90_000);
      await withSponsorFixture(async f => {
        const sponsorId = await seedSponsor(f);
        const { termId } = await seedTerm(f, sponsorId);
        const entryId = await seedEntry(f, termId, f.member);
        const token = optOutToken(rosterSecret, entryId);
        await withFreshPage(browser, info, false, async page => {
          const url = routePath(info, `/${locale}/sponsor/opt-out/${token}`);
          const before = await readEntry(f, entryId);
          await gotoApp(page, url, info, { marker: 'public-sponsor-opt-out-page-ready' });
          await expect(
            visible(
              page.getByRole('heading', {
                name: copy(locale, 'sponsorOptOut', 'title'),
                exact: true,
              })
            )
          ).toBeVisible();
          expect(await readEntry(f, entryId)).toEqual(before);
          expect(before.revokedAt).toBeNull();
          await dismissCookies(page);
          const confirm = visible(
            page.getByRole('button', {
              name: copy(locale, 'sponsorOptOut', 'confirm'),
              exact: true,
            })
          );
          await tabTo(page, confirm);
          await page.keyboard.press('Enter');
          const status = visible(page.getByTestId('public-sponsor-opt-out-page-ready')).getByRole(
            'status'
          );
          await expect(status).toHaveText(copy(locale, 'sponsorOptOut', 'done'));
          await expect(status).toHaveAttribute('aria-live', 'polite');
          await expect(status).toBeFocused();
          await expect
            .poll(async () => (await readEntry(f, entryId)).revokedReason)
            .toBe('opted_out');
          await gotoApp(page, url, info, { marker: 'public-sponsor-opt-out-page-ready' });
          // GET never resolves the token (§3.8); a used or malformed link is refused on submission.
          for (const link of [url, routePath(info, `/${locale}/sponsor/opt-out/malformed`)]) {
            await gotoApp(page, link, info, { marker: 'public-sponsor-opt-out-page-ready' });
            await tabTo(page, confirm);
            await page.keyboard.press('Enter');
            await expect(status).toHaveText(copy(locale, 'sponsorOptOut', 'invalid'));
          }
        });
      });
    });
  }
});
