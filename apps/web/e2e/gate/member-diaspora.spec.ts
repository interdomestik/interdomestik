import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';

test.describe('Diaspora Feature', () => {
  test('Member can see Diaspora ribbon and navigate to Diaspora page', async ({
    authenticatedPage: page,
  }) => {
    // 1. Go to Member Home
    await page.goto(routes.member(test.info()));

    // Assert we are on the dashboard
    await expect(page.getByTestId('dashboard-heading')).toBeVisible();

    // 2. Check for Diaspora ribbon
    await expect(page.getByTestId('diaspora-ribbon')).toBeVisible();

    // 3. Navigate to Diaspora page
    const ribbonCta = page.getByTestId('diaspora-ribbon-cta');
    await expect(ribbonCta).toBeVisible();
    await ribbonCta.click();

    // 4. Assert we are on the Diaspora page
    await expect(page).toHaveURL(/\/member\/diaspora/);
    await expect(page.getByTestId('diaspora-page')).toBeVisible({ timeout: 15000 });

    // Check for the 3 cards content (using flexible text matching across languages)
    await expect(
      page.getByText(
        /(Aksident jashtë vendit|Accident abroad|Несреќа во странство|Nezgoda u inostranstvu)/i
      )
    ).toBeVisible();
    await expect(
      page.getByText(/(Udhëtim \/ Avio|Travel \/ Flight|Патување \/ Авио|Putovanje \/ Avio)/i)
    ).toBeVisible();
    await expect(
      page.getByText(
        /(Familja në Kosovë|Family in Kosovo|Семејството во Косово|Porodica na Kosovu)/i
      )
    ).toBeVisible();
  });
});
