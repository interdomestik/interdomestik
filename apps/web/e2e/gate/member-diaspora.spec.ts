import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

async function switchLocale(
  page: Parameters<typeof gotoApp>[0],
  languageLabel: string,
  optionLabel: string,
  expectedPath: string
) {
  const userMenuButton = page.locator('[data-testid="sidebar-user-menu-button"]:visible');
  await expect(userMenuButton).toHaveCount(1);
  await userMenuButton.click();
  await page.getByText(languageLabel, { exact: true }).hover();
  await page.getByRole('menuitem').filter({ hasText: optionLabel }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(expectedPath);
}

async function expectNoHorizontalOverflow(page: Parameters<typeof gotoApp>[0]) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
      )
    )
    .toBe(true);
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
    await gotoApp(page, routes.memberDiaspora('en'), testInfo, { marker: 'diaspora-page-ready' });
    await page.getByLabel('Origin').selectOption('DE');
    await page.getByLabel('Destination').selectOption('IT');

    const addTransit = page.getByRole('button', { name: 'Add transit country' });
    await addTransit.focus();
    await addTransit.press('Enter');
    const firstTransit = page.getByRole('combobox', {
      name: 'Transit country 1',
      exact: true,
    });
    await expect(firstTransit).toBeFocused();
    await firstTransit.selectOption('AT');
    await addTransit.click();
    await page.getByRole('combobox', { name: 'Transit country 2', exact: true }).selectOption('AT');
    await page.getByRole('button', { name: 'Show corridor summary' }).click();

    const corridorQuery = 'origin=DE&destination=IT&transit=AT&transit=AT';
    await expect.poll(() => new URL(page.url()).search.slice(1)).toBe(corridorQuery);
    await expect(page.getByTestId('diaspora-corridor-summary')).toContainText(
      'Germany → Austria → Austria → Italy'
    );
    await expect(page.getByTestId('diaspora-corridor-summary')).toContainText(
      'Preparation only. This does not start or update a claim.'
    );
    await expectNoHorizontalOverflow(page);

    await page.getByRole('link', { name: 'Italy' }).click();
    const preservedQuery = `country=IT&${corridorQuery}`;
    await expect.poll(() => new URL(page.url()).search.slice(1)).toBe(preservedQuery);
    await expect(page.getByTestId('diaspora-corridor-summary')).toBeVisible();

    await page.setViewportSize(originalViewport);
    await switchLocale(page, 'Language', 'Shqip', routes.memberDiaspora('sq'));
    await expect.poll(() => new URL(page.url()).search.slice(1)).toBe(preservedQuery);
    await expect(
      page.getByRole('region', { name: 'Korridori yt i udhëtimit', exact: true })
    ).toContainText('Gjermania → Austri → Austri → Italia');
    await switchLocale(page, 'Gjuha', 'Македонски', routes.memberDiaspora('mk'));
    await expect.poll(() => new URL(page.url()).search.slice(1)).toBe(preservedQuery);
    await expect(
      page.getByRole('region', { name: 'Вашиот патен коридор', exact: true })
    ).toContainText('Германија → Австрија → Австрија → Италија');
    await switchLocale(page, 'Јазик', 'Srpski', routes.memberDiaspora('sr'));
    await expect.poll(() => new URL(page.url()).search.slice(1)).toBe(preservedQuery);
    await expect(
      page.getByRole('region', { name: 'Vaš putni koridor', exact: true })
    ).toContainText('Nemačka → Austrija → Austrija → Italija');

    for (const query of [
      '?country=DE',
      '?origin=DE&destination=',
      '?origin=de&destination=IT',
      '?origin=US&destination=IT',
      '?origin=DE&origin=CH&destination=IT',
      '?origin=DE&destination=IT&transit=US',
    ]) {
      await gotoApp(page, `${routes.memberDiaspora('en')}${query}`, testInfo, {
        marker: 'diaspora-page-ready',
      });
      await expect(page.getByTestId('diaspora-corridor-summary')).toHaveCount(0);
    }
  });

  test('discloses fail-closed pack status only for an applied explicit corridor', async ({
    authenticatedPage: page,
  }, testInfo) => {
    const originalViewport = page.viewportSize();
    if (!originalViewport) throw new Error('Diaspora gate requires a configured viewport.');
    await gotoApp(page, routes.memberDiaspora('en'), testInfo, { marker: 'diaspora-page-ready' });
    await expect(page.getByTestId('diaspora-pack-status')).toHaveCount(0);

    await page.getByLabel('Origin').selectOption('DE');
    await page.getByLabel('Destination').selectOption('IT');
    const addTransit = page.getByRole('button', { name: 'Add transit country' });
    for (const [position, country] of ['MK', 'AT', 'MK'].entries()) {
      await addTransit.click();
      await page
        .getByRole('combobox', { name: `Transit country ${position + 1}`, exact: true })
        .selectOption(country);
    }
    await page.getByRole('button', { name: 'Show corridor summary' }).click();
    const corridorQuery = 'origin=DE&destination=IT&transit=MK&transit=AT&transit=MK';
    await expect.poll(() => new URL(page.url()).search.slice(1)).toBe(corridorQuery);

    const disclosure = page.getByTestId('diaspora-pack-status');
    await expect(disclosure).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(1);
    await expect(disclosure.getByRole('listitem')).toHaveCount(4);
    await expect(page.getByTestId('diaspora-pack-status-DE')).toContainText('Unavailable');
    await expect(page.getByTestId('diaspora-pack-status-MK')).toContainText('Exposed');
    await expect(page.getByTestId('diaspora-pack-status-AT')).toContainText('Unavailable');
    await expect(page.getByTestId('diaspora-pack-status-IT')).toContainText('Unavailable');
    await expect(disclosure).toContainText(
      'Pack exposure does not mean downloaded, current, verified, or ready offline.'
    );

    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectNoHorizontalOverflow(page);
    const html = page.locator('html');
    const originalHtmlClass = await html.getAttribute('class');
    try {
      await html.evaluate(element => element.classList.add('dark'));
      await expect(disclosure).toHaveClass(/dark:bg-slate-950/);
      await expect(disclosure.getByRole('listitem').first()).toHaveClass(/dark:bg-slate-900/);
    } finally {
      await html.evaluate((element, className) => {
        if (className === null) element.removeAttribute('class');
        else element.setAttribute('class', className);
      }, originalHtmlClass);
    }
    await page.setViewportSize(originalViewport);

    const localizedCases = [
      {
        countries: ['Gjermania', 'Maqedonia e Veriut', 'Austri', 'Italia'],
        exposed: 'E shfaqur',
        locale: 'sq',
        title: 'Statusi i paketës Help Now për këtë korridor',
        unavailable: 'E padisponueshme',
      },
      {
        countries: ['Германија', 'Северна Македонија', 'Австрија', 'Италија'],
        exposed: 'Изложен',
        locale: 'mk',
        title: 'Статус на Help Now пакетите за овој коридор',
        unavailable: 'Недостапен',
      },
      {
        countries: ['Nemačka', 'Severna Makedonija', 'Austrija', 'Italija'],
        exposed: 'Izložen',
        locale: 'sr',
        title: 'Status Help Now paketa za ovaj koridor',
        unavailable: 'Nedostupan',
      },
    ] as const;

    for (const packCase of localizedCases) {
      await gotoApp(page, `${routes.memberDiaspora(packCase.locale)}?${corridorQuery}`, testInfo, {
        marker: 'diaspora-page-ready',
      });
      await expect(page.getByRole('heading', { name: packCase.title })).toBeVisible();
      const localizedDisclosure = page.getByTestId('diaspora-pack-status');
      await expect(localizedDisclosure.getByRole('listitem')).toHaveCount(4);
      for (const [index, country] of packCase.countries.entries()) {
        await expect(localizedDisclosure.getByRole('listitem').nth(index)).toContainText(country);
        await expect(localizedDisclosure.getByRole('listitem').nth(index)).toContainText(
          index === 1 ? packCase.exposed : packCase.unavailable
        );
      }
    }

    await gotoApp(page, `${routes.memberDiaspora('en')}?country=DE`, testInfo, {
      marker: 'diaspora-page-ready',
    });
    await expect(page.getByTestId('diaspora-pack-status')).toHaveCount(0);
  });

  test('Member can use the retained diaspora workflow from its canonical route', async ({
    authenticatedPage: page,
  }, testInfo) => {
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
      await gotoApp(page, routes.memberDiaspora(locale), testInfo, {
        marker: 'diaspora-page-ready',
      });

      await expect(page).toHaveURL(new RegExp(`${routes.memberDiaspora(locale)}(?:[?#]|$)`));
      await expect(page.getByTestId('diaspora-page-ready')).toBeVisible({ timeout: 15000 });
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
      await expectNoHorizontalOverflow(page);

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

    await gotoApp(page, routes.memberDiaspora(testInfo), testInfo, {
      marker: 'diaspora-page-ready',
    });

    const italySelector = page.getByRole('link', {
      name: /(Italy|Италија|Italia)/i,
    });
    await italySelector.click();

    await expect(page).toHaveURL(/\/member\/diaspora\?country=IT/);
    await expect(page.getByTestId('diaspora-selected-country')).toContainText(
      /(Italy|Италија|Italia)/i
    );
    await expect(italySelector).toHaveAttribute('aria-current', 'page');
    await expectNoHorizontalOverflow(page);

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
