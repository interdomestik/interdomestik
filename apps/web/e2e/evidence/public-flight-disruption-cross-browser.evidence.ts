import { expect, test } from '@playwright/test';
import { routes } from '../routes';
import { withAnonymousPage } from '../utils/anonymous-context';
import { gotoApp } from '../utils/navigation';

test('cross-browser smoke preserves flight orientation and responsive boundaries', async ({
  browser,
}, info) => {
  await withAnonymousPage(browser, info, async page => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, routes.home('sq'), info, { marker: 'public-entry-hero' });
    const journey = page.getByTestId('flight-disruption-journey');
    await expect(async () => {
      await page.getByTestId('public-entry-flight').click();
      await expect(journey).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    await journey.getByRole('button', { name: 'Jo' }).click();

    await expect(journey.getByRole('heading', { name: /Çfarë problemi patët/i })).toBeVisible();
    expect(await journey.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true
    );
  });
});
