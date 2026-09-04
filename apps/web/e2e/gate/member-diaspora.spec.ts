import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Diaspora Feature', () => {
  test('retained member handoffs settle', async ({ authenticatedPage: page }, testInfo) => {
    // prettier-ignore
    for (const [path, marker] of [['claim-report', 'report-page-ready'], ['green-card', 'green-card-page-ready'], ['benefits', 'benefits-page-ready']] as const) await gotoApp(page, `${routes.member(testInfo)}/${path}`, testInfo, { marker });
  });

  test('Member can use the retained diaspora workflow from its canonical route', async ({
    authenticatedPage: page,
  }, testInfo) => {
    // The legacy dashboard ribbon was intentionally retired by T-117B. The product capability
    // remains covered at the existing canonical route without compatibility markup.
    await gotoApp(page, routes.memberDiaspora(testInfo), testInfo, { marker: 'diaspora-page' });

    await expect(page).toHaveURL(/\/member\/diaspora/);
    await expect(page.getByTestId('diaspora-page')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('diaspora-country-selector')).toBeVisible();
    await expect(page.getByTestId('diaspora-selected-country')).toBeVisible();
    await expect(
      page.getByRole('link', {
        name: /(Start travel claim|Започни патно барање|Nis kërkesën e udhëtimit|Pokreni zahtev za putovanje)/i,
      })
    ).toHaveAttribute('href', /\/member\/claims\/new\?category=travel/);
    await expect(
      page.getByRole('link', {
        name: /(Contact support now|Контактирај поддршка сега|Kontakto mbështetjen tani|Kontaktiraj podršku sada)/i,
      })
    ).toHaveAttribute('href', /^tel:/);

    const italySelector = page.getByRole('link', {
      name: /(Italy|Италија|Italia)/i,
    });
    await italySelector.click();

    await expect(page).toHaveURL(/\/member\/diaspora\?country=IT/);
    await expect(page.getByTestId('diaspora-selected-country')).toContainText(
      /(Italy|Италија|Italia)/i
    );

    const claimStartLink = page.getByRole('link', {
      name: /(Start travel claim|Започни патно барање|Nis kërkesën e udhëtimit|Pokreni zahtev za putovanje)/i,
    });
    await expect(claimStartLink).toHaveAttribute(
      'href',
      /\/member\/claims\/new\?category=travel&source=diaspora-green-card&country=IT&incidentLocation=abroad/
    );

    await Promise.all([
      page.waitForURL(
        /\/member\/claims\/new\?category=travel&source=diaspora-green-card&country=IT&incidentLocation=abroad/
      ),
      claimStartLink.click(),
    ]);

    await expect(page.getByTestId('claim-wizard-handoff')).toBeVisible();
    await expect(page.getByTestId('claim-wizard-handoff')).toContainText(/(Italy|Италија|Italia)/i);
  });
});
