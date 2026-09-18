import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

async function switchLocale(
  page: Parameters<typeof gotoApp>[0],
  languageLabel: string,
  optionLabel: string,
  expectedPath: string
) {
  await page.getByTestId('sidebar-user-menu-button').click();
  await page.getByText(languageLabel, { exact: true }).hover();
  await page.getByRole('menuitem').filter({ hasText: optionLabel }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(expectedPath);
}

test.describe('Diaspora Feature', () => {
  test('retained member handoffs settle', async ({ authenticatedPage: page }, testInfo) => {
    // prettier-ignore
    for (const [path, marker] of [['claim-report', 'report-page-ready'], ['green-card', 'green-card-page-ready'], ['benefits', 'benefits-page-ready']] as const) await gotoApp(page, `${routes.member(testInfo)}/${path}`, testInfo, { marker });
  });

  test('captures an exact corridor and preserves it through guidance and locale changes', async ({
    authenticatedPage: page,
  }, testInfo) => {
    const originalViewport = page.viewportSize();
    if (!originalViewport) throw new Error('Diaspora gate requires a configured viewport.');

    await page.setViewportSize({ width: 320, height: 720 });
    await gotoApp(page, routes.memberDiaspora('en'), testInfo, { marker: 'diaspora-page' });
    await page.getByLabel('Origin').selectOption('DE');
    await page.getByLabel('Destination').selectOption('IT');

    const addTransit = page.getByRole('button', { name: 'Add transit country' });
    await addTransit.focus();
    await addTransit.press('Enter');
    await expect(page.getByLabel('Transit country 1')).toBeFocused();
    await page.getByLabel('Transit country 1', { exact: true }).selectOption('AT');
    await addTransit.click();
    await page.getByLabel('Transit country 2', { exact: true }).selectOption('AT');
    await page.getByRole('button', { name: 'Show corridor summary' }).click();

    const corridorQuery = 'origin=DE&destination=IT&transit=AT&transit=AT';
    await expect.poll(() => new URL(page.url()).search.slice(1)).toBe(corridorQuery);
    await expect(page.getByTestId('diaspora-corridor-summary')).toContainText(
      'Germany → Austria → Austria → Italy'
    );
    await expect(page.getByTestId('diaspora-corridor-summary')).toContainText(
      'Preparation only. This does not start or update a claim.'
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        )
      )
      .toBe(true);

    await page.getByRole('link', { name: 'Italy' }).click();
    const preservedQuery = `country=IT&${corridorQuery}`;
    await expect.poll(() => new URL(page.url()).search.slice(1)).toBe(preservedQuery);
    await expect(page.getByTestId('diaspora-corridor-summary')).toBeVisible();

    await page.setViewportSize(originalViewport);
    await switchLocale(page, 'Language', 'Shqip', '/sq/member/diaspora');
    await expect.poll(() => new URL(page.url()).search.slice(1)).toBe(preservedQuery);
    await expect(page.getByTestId('diaspora-corridor-summary')).toContainText(
      'Gjermania → Austria → Austria → Italia'
    );
    await switchLocale(page, 'Gjuha', 'Македонски', '/mk/member/diaspora');
    await expect.poll(() => new URL(page.url()).search.slice(1)).toBe(preservedQuery);
    await expect(page.getByTestId('diaspora-corridor-summary')).toContainText(
      'Германија → Австрија → Австрија → Италија'
    );
    await switchLocale(page, 'Јазик', 'Srpski', '/sr/member/diaspora');
    await expect.poll(() => new URL(page.url()).search.slice(1)).toBe(preservedQuery);
    await expect(page.getByTestId('diaspora-corridor-summary')).toContainText(
      'Nemačka → Austrija → Austrija → Italija'
    );

    for (const query of [
      '?country=DE',
      '?origin=DE&destination=',
      '?origin=de&destination=IT',
      '?origin=US&destination=IT',
      '?origin=DE&origin=CH&destination=IT',
      '?origin=DE&destination=IT&transit=US',
    ]) {
      await gotoApp(page, `${routes.memberDiaspora('en')}${query}`, testInfo, {
        marker: 'diaspora-page',
      });
      await expect(page.getByTestId('diaspora-corridor-summary')).toHaveCount(0);
    }
  });

  test('Member can use the retained diaspora workflow from its canonical route', async ({
    authenticatedPage: page,
  }, testInfo) => {
    // The legacy dashboard ribbon was intentionally retired by T-117B. The product capability
    // remains covered at the existing canonical route without compatibility markup.
    const originalViewport = page.viewportSize();
    if (!originalViewport) {
      throw new Error('Diaspora gate requires a configured Playwright viewport.');
    }
    await page.setViewportSize({ width: 320, height: 720 });
    const localeCases = [
      {
        locale: 'en',
        requiredTitle: 'Choose a country to see guidance',
        italyLabel: 'Italy',
        claimLabel: 'Prepare vehicle claim',
      },
      {
        locale: 'sq',
        requiredTitle: 'Zgjidhni një shtet për të parë udhëzimet',
        italyLabel: 'Italia',
        claimLabel: 'Përgatit kërkesën për automjet',
      },
      {
        locale: 'mk',
        requiredTitle: 'Изберете држава за да ги видите насоките',
        italyLabel: 'Италија',
        claimLabel: 'Подготви барање за возило',
      },
      {
        locale: 'sr',
        requiredTitle: 'Izaberite državu da biste videli uputstva',
        italyLabel: 'Italija',
        claimLabel: 'Pripremi zahtev za vozilo',
      },
    ] as const;

    for (const { locale, requiredTitle, italyLabel, claimLabel } of localeCases) {
      await gotoApp(page, routes.memberDiaspora(locale), testInfo, { marker: 'diaspora-page' });

      await expect(page).toHaveURL(new RegExp(`${routes.memberDiaspora(locale)}(?:[?#]|$)`));
      await expect(page.getByTestId('diaspora-page')).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('diaspora-country-selector')).toBeVisible();
      await expect(page.getByRole('heading', { name: requiredTitle })).toBeVisible();
      await expect(page.getByTestId('diaspora-selected-country')).toHaveCount(0);
      await expect(
        page.getByRole('link', {
          name: /(Prepare vehicle claim|Подготви барање за возило|Përgatit kërkesën për automjet|Pripremi zahtev za vozilo)/i,
        })
      ).toHaveCount(0);
      await expect(
        page.getByRole('link', {
          name: /(Contact support now|Контактирај поддршка сега|Kontakto mbështetjen tani|Kontaktiraj podršku sada)/i,
        })
      ).toHaveAttribute('href', /^tel:/);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
          )
        )
        .toBe(true);

      const localizedItalySelector = page.getByRole('link', { name: italyLabel });
      await localizedItalySelector.click();
      await expect(page).toHaveURL(new RegExp(`${routes.memberDiaspora(locale)}\\?country=IT$`));
      await expect(page.getByTestId('diaspora-selected-country')).toContainText(italyLabel);
      await expect(localizedItalySelector).toHaveAttribute('aria-current', 'page');
      await expect(page.getByText('113', { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: claimLabel })).toHaveAttribute(
        'href',
        /\/member\/claims\/new\?category=vehicle&source=diaspora-green-card&country=IT&incidentLocation=abroad/
      );
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
          )
        )
        .toBe(true);
    }

    await gotoApp(page, routes.memberDiaspora(testInfo), testInfo, { marker: 'diaspora-page' });

    const italySelector = page.getByRole('link', {
      name: /(Italy|Италија|Italia)/i,
    });
    await italySelector.click();

    await expect(page).toHaveURL(/\/member\/diaspora\?country=IT/);
    await expect(page.getByTestId('diaspora-selected-country')).toContainText(
      /(Italy|Италија|Italia)/i
    );
    await expect(italySelector).toHaveAttribute('aria-current', 'page');
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        )
      )
      .toBe(true);

    await page.setViewportSize(originalViewport);

    const claimStartLink = page.getByRole('link', {
      name: /(Prepare vehicle claim|Подготви барање за возило|Përgatit kërkesën për automjet|Pripremi zahtev za vozilo)/i,
    });
    await expect(claimStartLink).toHaveAttribute(
      'href',
      /\/member\/claims\/new\?category=vehicle&source=diaspora-green-card&country=IT&incidentLocation=abroad/
    );

    await Promise.all([
      page.waitForURL(
        /\/member\/claims\/new\?category=vehicle&source=diaspora-green-card&country=IT&incidentLocation=abroad/
      ),
      claimStartLink.click(),
    ]);

    await expect(page.getByTestId('claim-wizard-handoff')).toBeVisible();
    await expect(page.getByTestId('claim-wizard-handoff')).toContainText(/(Italy|Италија|Italia)/i);
    const details = page.getByTestId('claim-draft-main-panel');
    await expect(details.locator('option[value="collision"]')).toHaveCount(1);
    await expect(page.getByTestId('claim-draft-travel')).toHaveCount(0);
    const confirmation = page.getByTestId('claim-wizard-country-confirmation');
    await expect(confirmation).not.toBeChecked();
    await confirmation.focus();
    await expect(confirmation).toBeFocused();
    await confirmation.press('Space');
    await expect(confirmation).toBeChecked();
  });
});
