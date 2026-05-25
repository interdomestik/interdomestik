import type { TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

function projectOrigin(testInfo: TestInfo): string {
  const baseURL = testInfo.project.use.baseURL?.toString();
  if (!baseURL) {
    throw new Error('Expected project.use.baseURL for live-surface revalidation.');
  }
  return new URL(baseURL).origin;
}

function normalizeHost(rawHost: string | undefined, fallback: string): string {
  const value = rawHost?.trim() || fallback;
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return new URL(value).host;
  }
  return value.split('/')[0] ?? fallback;
}

test.describe('P21-QA01 v1.0.0 live surface revalidation', () => {
  test('public launch entry surfaces serve without server errors', async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    try {
      const homeResponse = await gotoApp(page, routes.home(testInfo), testInfo, {
        marker: 'landing-page-ready',
      });
      expect(homeResponse?.status(), 'home should serve without a server error').toBeLessThan(500);
      await expect(page.getByTestId('landing-page-ready')).toBeVisible();

      const pricingResponse = await gotoApp(page, routes.pricing(testInfo), testInfo, {
        marker: 'pricing-page-ready',
      });
      expect(pricingResponse?.status(), 'pricing should serve without a server error').toBeLessThan(
        500
      );
      await expect(page.getByTestId('pricing-page-ready')).toBeVisible();
      await expect(page.locator('body')).not.toContainText(/Stripe/i);

      const servicesResponse = await gotoApp(
        page,
        `/${routes.getLocale(testInfo)}/services`,
        testInfo,
        {
          marker: 'services-commercial-disclaimers',
        }
      );
      expect(
        servicesResponse?.status(),
        'services should serve without a server error'
      ).toBeLessThan(500);
      await expect(page.getByTestId('services-coverage-matrix')).toBeVisible();
      await expect(page.getByTestId('services-scope-tree')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('pilot host resolves to pilot-mk and sets the tenant cookie', async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'gate-ks-sq',
      'Pilot host smoke is project-independent; run it once in the KS gate lane.'
    );

    const pilotHost = normalizeHost(process.env.PILOT_HOST, 'pilot.127.0.0.1.nip.io:3000');
    const pilotOrigin = `http://${pilotHost}`;
    const context = await browser.newContext({
      baseURL: `${pilotOrigin}${routes.home(testInfo)}`,
      extraHTTPHeaders: {
        'x-forwarded-host': pilotHost,
      },
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    try {
      const response = await gotoApp(page, `${pilotOrigin}${routes.login(testInfo)}`, testInfo, {
        marker: 'domcontentloaded',
      });
      expect(
        response?.status(),
        'pilot host login should serve without a server error'
      ).toBeLessThan(500);
      await expect(page.getByTestId('tenant-chooser')).toHaveCount(0);

      const tenantCookie = (await context.cookies(pilotOrigin)).find(
        cookie => cookie.name === 'tenantId'
      );
      expect(tenantCookie?.value).toBe('pilot-mk');
    } finally {
      await context.close();
    }
  });

  test('anonymous protected dashboards redirect to login before layout guards render', async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
      storageState: { cookies: [], origins: [] },
    });
    const origin = projectOrigin(testInfo);

    try {
      for (const path of [
        routes.member(testInfo),
        `/${routes.getLocale(testInfo)}/agent`,
        routes.agent(testInfo),
        routes.staffClaims(testInfo),
        routes.admin(testInfo),
      ]) {
        const url = new URL(path, origin).toString();
        const response = await context.request.get(url, { maxRedirects: 0 });
        expect(response.status(), `Expected proxy redirect for ${url}`).toBe(307);
        expect(response.headers()['x-auth-guard']).toBe('middleware-redirect');

        const location = response.headers().location;
        expect(location, `Expected login Location header for ${url}`).toBeTruthy();
        expect(new URL(location, origin).pathname).toBe(routes.login(testInfo));
      }
    } finally {
      await context.close();
    }
  });

  test('launch-critical authenticated dashboards serve readiness markers', async ({
    page,
    loginAs,
    agentPage,
    staffPage,
    adminPage,
  }, testInfo) => {
    await loginAs('member');
    await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'member-dashboard-ready' });
    await gotoApp(page, routes.memberNewClaim(testInfo), testInfo, {
      marker: 'new-claim-page-ready',
    });

    await gotoApp(agentPage, routes.agent(testInfo), testInfo, { marker: 'agent-members-ready' });
    await gotoApp(agentPage, routes.agentCrm(testInfo), testInfo, {
      marker: 'dashboard-page-ready',
    });

    await gotoApp(staffPage, routes.staffClaims(testInfo), testInfo, {
      marker: 'staff-page-ready',
    });
    await gotoApp(adminPage, routes.admin(testInfo), testInfo, { marker: 'admin-page-ready' });
  });

  test('agent can enter member claim context and return to CRM without session loss', async ({
    agentPage: page,
  }, testInfo) => {
    await gotoApp(page, `/${routes.getLocale(testInfo)}/agent`, testInfo, {
      marker: 'dashboard-page-ready',
    });

    await page.getByTestId('agent-member-dashboard-cta').first().click();
    await expect(page).toHaveURL(new RegExp(`${routes.member(testInfo)}$`));
    await expect(
      page.locator('[data-testid="member-dashboard-ready"]:visible').first()
    ).toBeVisible({
      timeout: 15000,
    });

    const memberStartClaimCta = page.getByTestId('hero-cta-open-first-case').first();
    await expect(memberStartClaimCta).toBeVisible();
    await memberStartClaimCta.click({ force: true });
    await expect(page).toHaveURL(new RegExp(`${routes.memberNewClaim(testInfo)}$`));
    await expect(page.getByTestId('new-claim-page-ready')).toBeVisible();

    await page.locator(`a[href$="/agent"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/${routes.getLocale(testInfo)}/agent$`));
    await expect(page.getByTestId('dashboard-page-ready')).toBeVisible();

    await gotoApp(page, routes.agent(testInfo), testInfo, { marker: 'agent-members-ready' });
    const agentMembersReady = page.locator('[data-testid="agent-members-ready"]:visible').last();
    await expect(agentMembersReady).toBeVisible();
    await agentMembersReady.getByTestId('agent-support-link').click();
    await expect(page).toHaveURL(new RegExp(`${routes.agentCrm(testInfo)}$`));
    await expect(page.getByTestId('dashboard-page-ready')).toBeVisible();
  });
});
