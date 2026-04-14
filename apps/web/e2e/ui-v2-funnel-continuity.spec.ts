import { expect, test } from '@playwright/test';
import { routes } from './routes';
import { withAnonymousPage } from './utils/anonymous-context';
import { gotoApp } from './utils/navigation';

test.describe('UI_V2 landing funnel continuity', () => {
  test('exposes experiment marker and preserves pricing plan continuity links', async ({
    browser,
  }, testInfo) => {
    await withAnonymousPage(browser, testInfo, async page => {
      await gotoApp(page, routes.home(testInfo), testInfo, { marker: 'landing-page-ready' });

      const landing = page.getByTestId('landing-page-ready');
      await expect(landing).toHaveAttribute('data-experiment', 'home-funnel');
      const variant = await landing.getAttribute('data-variant');
      expect(variant === 'hero_v1' || variant === 'hero_v2').toBeTruthy();

      if (variant === 'hero_v2') {
        await expect(page.getByTestId('hero-v2-start-claim')).toBeVisible();
      }

      await expect(page.getByTestId('pricing-plan-link-standard')).toHaveAttribute(
        'href',
        /\/pricing\?plan=standard/
      );
      await expect(page.getByTestId('pricing-plan-link-family')).toHaveAttribute(
        'href',
        /\/pricing\?plan=family/
      );
      await expect(page.getByTestId('pricing-plan-link-business')).toHaveAttribute(
        'href',
        /\/pricing\?plan=business/
      );
    });
  });
});
