import { expect, test } from '@playwright/test';
import { routes } from '../routes';
import { withAnonymousPage } from '../utils/anonymous-context';
import { gotoApp } from '../utils/navigation';

test('cross-browser smoke preserves the safe route and responsive boundary', async ({
  browser,
}, info) => {
  await withAnonymousPage(browser, info, async page => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, routes.home('sq'), info, { marker: 'public-entry-hero' });
    await page.waitForFunction(() => {
      const vehicle = document.querySelector('[data-testid="public-entry-vehicle"]');
      return vehicle ? Object.keys(vehicle).some(key => key.startsWith('__reactProps$')) : false;
    });
    await page.getByTestId('public-entry-vehicle').click();
    const journey = page.getByTestId('accident-safety-journey');
    await journey.getByRole('button', { name: 'Jo, vetëm dëm material' }).click();

    await expect(journey.getByRole('heading', { name: /A mund të lëvizet vetura/i })).toBeVisible();
    expect(await journey.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true
    );
  });
});
