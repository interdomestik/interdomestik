import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { initializeConsent } from '../utils/consent';
import { gotoApp } from '../utils/navigation';

const SURFACES = [
  { path: 'claims', marker: 'member-claims-filter-region' },
  { path: 'documents', marker: 'member-documents-page-ready' },
  { path: 'help', marker: 'member-page-ready' },
  { path: 'membership', marker: 'membership-page-ready' },
  { path: 'membership/card', marker: 'member-membership-card-ready' },
  { path: 'membership/success', marker: 'success-page-ready' },
  { path: 'policies', marker: 'dashboard-page-ready', ready: 'a[href$="/policies/upload"]' },
  { path: 'policies/upload', marker: 'dashboard-page-ready', ready: 'input#policy' },
  { path: 'settings', marker: 'dashboard-page-ready', ready: '#profile input' },
  { path: 'rights', marker: 'dashboard-page-ready', ready: 'a[href$="/claims/new"]' },
  { path: 'diaspora', marker: 'diaspora-form-ready' },
  { path: 'claim-report', marker: 'report-page-ready' },
  { path: 'green-card', marker: 'green-card-page-ready' },
  { path: 'benefits', marker: 'benefits-page-ready' },
  { path: 'incident-guide', marker: 'incident-guide-page-ready' },
  { path: 'claims/new', marker: 'new-claim-page-ready' },
] as const;

function localesFor(info: TestInfo): readonly string[] {
  return routes.getLocale(info) === 'mk' ? ['mk'] : ['sq', 'de'];
}

function memberContent(page: Page): Locator {
  return page.getByTestId('role-shell').locator('main > div.overflow-x-hidden');
}

/** The scroller itself must fit; its intentionally wider descendants may scroll locally. */
function overflowingElements(root: Element): string[] {
  const viewportWidth = document.documentElement.clientWidth;
  const failures: string[] = [];
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') {
      continue;
    }
    let ancestor = element.parentElement;
    let locallyScrolled = false;
    while (ancestor && ancestor !== root && root.contains(ancestor)) {
      const overflowX = getComputedStyle(ancestor).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') {
        locallyScrolled = true;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    if (locallyScrolled) continue;
    const right = element.getBoundingClientRect().right;
    if (right > viewportWidth + 0.5) {
      const identity = element.getAttribute('data-testid') ?? element.tagName;
      const text = element.textContent?.trim().slice(0, 90) ?? '';
      failures.push(`${identity} right=${right.toFixed(2)}: ${text}`);
    }
  }
  return failures;
}

async function expectReflow(page: Page, label: string): Promise<void> {
  const content = memberContent(page);
  await expect(content).toHaveCount(1);
  await expect(content.getByRole('heading').first()).toBeVisible();
  // Removing both axes avoids CSS computing visible back to auto beside a hidden other axis.
  await content.evaluate(element => {
    element.style.overflowX = 'visible';
    element.style.overflowY = 'visible';
  });
  await expect(content).toHaveCSS('overflow-x', 'visible');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 800 });
    await expect
      .poll(() => content.evaluate(overflowingElements), { message: `${label} at ${width}px` })
      .toEqual([]);
  }
}

async function expectClaimsSettled(page: Page): Promise<void> {
  await expect(
    page.getByTestId('member-claims-table-region').or(page.getByTestId('member-claims-empty'))
  ).toBeVisible();
}

test.describe('Member pages reflow inside the role shell', () => {
  for (const surface of SURFACES) {
    test(`${surface.path} fits narrow mobile viewports`, async ({
      authenticatedPage: page,
    }, info) => {
      test.setTimeout(120_000);
      await initializeConsent(page);
      await page.setViewportSize({ width: 320, height: 800 });
      for (const locale of localesFor(info)) {
        const path = `${routes.member(locale)}/${surface.path}`;
        const response = await gotoApp(page, path, info, { marker: surface.marker });
        expect(response?.status(), path).toBe(200);
        await expect(page).toHaveURL(url => url.pathname === path);
        if ('ready' in surface) {
          await expect(memberContent(page).locator(surface.ready).first()).toBeVisible();
        }
        if (surface.path === 'claims') await expectClaimsSettled(page);
        await expectReflow(page, path);
      }
    });
  }

  test('a member claim detail fits narrow mobile viewports', async ({
    authenticatedPage: page,
  }, info) => {
    test.setTimeout(120_000);
    await initializeConsent(page);
    await page.setViewportSize({ width: 320, height: 800 });
    for (const locale of localesFor(info)) {
      const claimsPath = routes.memberClaims(locale);
      await gotoApp(page, claimsPath, info, { marker: 'member-claims-filter-region' });
      await expectClaimsSettled(page);
      const claimLink = page.getByTestId('member-claims-table-region').locator('tbody a').first();
      await expect(claimLink).toBeVisible();
      const href = await claimLink.getAttribute('href');
      expect(href).toMatch(new RegExp(`^${claimsPath}/[^/]+$`));
      if (!href) throw new Error('The seeded member must have a claim detail link');
      const response = await gotoApp(page, href, info, { marker: 'member-claim-detail-page' });
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(url => url.pathname === href);
      await expectReflow(page, href);
    }
  });
});
