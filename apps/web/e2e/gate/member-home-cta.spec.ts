import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

const MEMBER_HOME_MARKER_TIMEOUT_MS = 30000;
const DASHBOARD_HIERARCHY_VIEWPORTS = [
  { name: 'mobile 360', width: 360, height: 740 },
  { name: 'mobile 390', width: 390, height: 844 },
  { name: 'mobile 430', width: 430, height: 932 },
] as const;

test.describe('Strict Gate: Member Home Crystal UI', () => {
  test('Member can navigate via the member home CTAs', async ({
    authenticatedPage: page,
  }, testInfo) => {
    const clickCtaAndAssertNavigation = async (
      ctaTestId: string,
      urlPattern: RegExp,
      readyMarker: string,
      primaryHref: string
    ) => {
      const cta = page.getByTestId(ctaTestId).first();
      await cta.scrollIntoViewIfNeeded();
      await expect(cta).toBeVisible();

      const href = await cta.getAttribute('href');
      expect(href, `${ctaTestId} must define href`).toBeTruthy();

      const navToTarget = page
        .waitForURL(urlPattern, { timeout: 7_000, waitUntil: 'commit' })
        .then(() => true)
        .catch(() => false);

      await cta.click();

      const reachedTarget = await navToTarget;
      const markerVisible = await page
        .getByTestId(readyMarker)
        .first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      if (!reachedTarget || !markerVisible) {
        await gotoApp(page, href!, testInfo, { marker: readyMarker });
      }

      await expect(page.getByText('Placeholder content.')).toHaveCount(0);
      await expect(page.locator(`a[href*="${primaryHref}"]`).first()).toBeVisible();
    };

    // 1. Go to Member Home
    await gotoApp(page, routes.member(test.info()), testInfo, {
      marker: 'member-dashboard-ready',
      markerTimeoutMs: MEMBER_HOME_MARKER_TIMEOUT_MS,
    });

    // Assert we are on the dashboard
    await expect(page.getByTestId('member-dashboard-ready').first()).toBeVisible();
    const resolvedHeroCta = page.getByTestId(/^hero-cta-/).first();
    await expect(resolvedHeroCta).toBeVisible();
    await expect(resolvedHeroCta).toHaveAttribute('href', /\/member\/(membership|claims)/);

    // 2. Report CTA
    await clickCtaAndAssertNavigation(
      'home-cta-report',
      /\/claim-report/,
      'report-page-ready',
      '/member/claims/new'
    );

    // Back to home
    await gotoApp(page, routes.member(test.info()), testInfo, {
      marker: 'member-dashboard-ready',
      markerTimeoutMs: MEMBER_HOME_MARKER_TIMEOUT_MS,
    });
    await expect(page.getByTestId('member-dashboard-ready').first()).toBeVisible();

    // 3. Green Card CTA
    await clickCtaAndAssertNavigation(
      'home-cta-green-card',
      /\/green-card/,
      'green-card-page-ready',
      '/member/diaspora'
    );

    // Back to home
    await gotoApp(page, routes.member(test.info()), testInfo, {
      marker: 'member-dashboard-ready',
      markerTimeoutMs: MEMBER_HOME_MARKER_TIMEOUT_MS,
    });
    await expect(page.getByTestId('member-dashboard-ready').first()).toBeVisible();

    // 4. Benefits CTA
    await clickCtaAndAssertNavigation(
      'home-cta-benefits',
      /\/benefits/,
      'benefits-page-ready',
      '/member/membership'
    );
  });

  for (const viewport of DASHBOARD_HIERARCHY_VIEWPORTS) {
    test(`Member dashboard hierarchy stays task-first at ${viewport.name}`, async ({
      authenticatedPage: page,
    }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gotoApp(page, routes.member(test.info()), testInfo, {
        marker: 'member-dashboard-ready',
        markerTimeoutMs: MEMBER_HOME_MARKER_TIMEOUT_MS,
      });

      const dashboard = page.getByTestId('member-dashboard-ready').first();
      const priorityRegion = dashboard.getByTestId('member-dashboard-priority-region');
      const secondaryRegion = dashboard.getByTestId('member-dashboard-secondary-region');

      await expect(dashboard).toBeVisible();
      await expect(priorityRegion).toBeVisible();
      await expect(secondaryRegion).toBeVisible();
      await expect(dashboard.getByTestId('dashboard-heading')).toBeVisible();
      await expect(dashboard.getByTestId('member-primary-actions')).toBeVisible();
      await expect(dashboard.getByTestId('member-hero-value-row')).toBeVisible();

      const heroProof = await dashboard.evaluate(element => {
        const valueRow = element.querySelector('[data-testid="member-hero-value-row"]');
        const actions = element.querySelector('[data-testid="member-primary-actions"]');
        const primaryCta = element.querySelector('[data-testid^="hero-cta-"]');
        const viewportHeight = window.innerHeight;

        return {
          primaryCtaCount: element.querySelectorAll('[data-testid^="hero-cta-"]').length,
          valueRowBottom: valueRow?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
          actionsBottom: actions?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
          primaryCtaBottom: primaryCta?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
          viewportHeight,
        };
      });
      expect(heroProof.primaryCtaCount).toBe(1);
      expect(heroProof.valueRowBottom).toBeLessThanOrEqual(heroProof.viewportHeight);
      expect(heroProof.actionsBottom).toBeLessThanOrEqual(heroProof.viewportHeight);
      expect(heroProof.primaryCtaBottom).toBeLessThanOrEqual(heroProof.viewportHeight);

      const priorityPrecedesSecondary = await dashboard.evaluate(element => {
        const priority = element.querySelector('[data-testid="member-dashboard-priority-region"]');
        const secondary = element.querySelector(
          '[data-testid="member-dashboard-secondary-region"]'
        );

        return Boolean(
          priority &&
          secondary &&
          priority.compareDocumentPosition(secondary) & Node.DOCUMENT_POSITION_FOLLOWING
        );
      });
      expect(priorityPrecedesSecondary).toBe(true);

      const dashboardHasHorizontalOverflow = await dashboard.evaluate(
        element => element.scrollWidth > element.clientWidth + 1
      );
      expect(dashboardHasHorizontalOverflow).toBe(false);

      const firstServiceCardClass = await dashboard
        .getByTestId('member-service-ecosystem-card')
        .first()
        .getAttribute('class');
      expect(firstServiceCardClass ?? '').not.toContain('cursor-pointer');
      expect(firstServiceCardClass ?? '').not.toContain('hover:-translate-y-1');
      expect(firstServiceCardClass ?? '').not.toContain('hover:shadow-xl');
      await expect(
        dashboard.getByRole('button', { name: /explore|истражи|eksploro|istraži/i })
      ).toHaveCount(0);
    });
  }
});
