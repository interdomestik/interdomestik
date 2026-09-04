// prettier-ignore
import { account, db, E2E_PASSWORD, eq, session as authSession, subscriptions, user } from '@interdomestik/database';
import { randomUUID } from 'node:crypto';
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import en from '../../src/messages/en/dashboard.json';
import mk from '../../src/messages/mk/dashboard.json';
import sq from '../../src/messages/sq/dashboard.json';
import sr from '../../src/messages/sr/dashboard.json';

// prettier-ignore
const VIEWPORTS = [[320, 740], [768, 1024], [1440, 1000]] as const;
const CATALOGS = { de: en, en, hr: sr, mk, sq, sr } as const;
const portalCopy = (testInfo: TestInfo) => CATALOGS[routes.getLocale(testInfo)].dashboard.portal;

// prettier-ignore
const openPortal = async (page: Page, testInfo: TestInfo) => gotoApp(page, routes.member(testInfo), testInfo, { marker: 'member-dashboard-ready' });

test.describe('Unified Member Portal', () => {
  test('renders canonical regions and navigation', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await openPortal(page, testInfo);
    const copy = portalCopy(testInfo);
    const portal = page.getByTestId('member-dashboard-ready').first();
    const regions = portal.locator('section[aria-label]');

    await expect(regions.nth(0)).toHaveAccessibleName(copy.regions.case.label);
    await expect(regions.nth(1)).toHaveAccessibleName(copy.regions.actions.label);
    await expect(regions.nth(2)).toHaveAccessibleName(copy.regions.updates.label);
    const navigation = portal.getByRole('navigation');
    // prettier-ignore
    const hrefs = [`/${routes.getLocale(testInfo)}/help-now`, `${routes.member(testInfo)}/claims`, `${routes.member(testInfo)}/documents`, `${routes.member(testInfo)}/membership`];
    await expect(navigation.locator('a')).toHaveCount(hrefs.length);
    // prettier-ignore
    for (const [index, href] of hrefs.entries())
      await expect(navigation.locator('a').nth(index)).toHaveAttribute('href', new RegExp(`${href}$`));
  });

  test('maps actions', async ({ page }, testInfo) => {
    const copy = portalCopy(testInfo);
    const tenantId = testInfo.project.name.includes('mk') ? 'tenant_mk' : 'tenant_ks';
    const subId = `t117b-${testInfo.project.name}-${testInfo.workerIndex}-${testInfo.retry}-${randomUUID()}`;
    const email = `${subId}@example.com`;
    const origin = new URL(String(testInfo.project.use.baseURL)).origin;
    let uid: string | null = null;
    const where = eq(subscriptions.id, subId);
    // prettier-ignore
    const set = (values: { status: 'active' | 'canceled' | 'past_due' | 'trialing'; cancelAtPeriodEnd?: boolean; gracePeriodEndsAt?: Date | null }) => db.update(subscriptions).set({ cancelAtPeriodEnd: false, gracePeriodEndsAt: null, ...values }).where(where);
    const actions = () =>
      page.getByTestId('member-dashboard-ready').locator('section[aria-label]').nth(1);
    const membership = `${routes.member(testInfo)}/membership`;
    // prettier-ignore
    const state = async (values: Parameters<typeof set>[0], label: string | null, warning: string | null = null, href = routes.memberNewClaim(testInfo)) => {
      await set(values); await page.reload();
      if (label) await expect(actions()).toContainText(label);
      if (warning) await expect(actions()).toContainText(warning);
      await expect(actions().getByRole('link')).toHaveAttribute('href', new RegExp(`${href}$`));
    };
    try {
      // prettier-ignore
      const signup = await page.request.post(`${origin}/api/auth/sign-up/email`, { data: { email, name: 'T117B lifecycle', onboarding: { mode: 'resolved', tenant: tenantId }, password: E2E_PASSWORD }, headers: { Origin: origin, Referer: `${origin}/register` } });
      if (!signup.ok()) throw new Error(`T117B signup failed: ${await signup.text()}`);
      // prettier-ignore
      const member = (await signup.json()).user as { branchId: string | null; id: string; tenantId: string };
      uid = member.id;
      // prettier-ignore
      await db.insert(subscriptions).values({ branchId: member.branchId, id: subId, planId: 'standard', status: 'active', tenantId: member.tenantId, userId: member.id });
      await openPortal(page, testInfo);
      await expect(actions()).toContainText(copy.actions.active);

      await state({ status: 'trialing' }, copy.actions.trialing);
      // prettier-ignore
      await state({ status: 'past_due', gracePeriodEndsAt: new Date(Date.now() + 86_400_000) }, copy.actions.active_in_grace, copy.warnings.active_in_grace);
      // prettier-ignore
      await state({ status: 'past_due', gracePeriodEndsAt: new Date(Date.now() - 86_400_000) }, null, copy.warnings.grace_expired, membership);
      // prettier-ignore
      await state({ status: 'active', cancelAtPeriodEnd: true }, copy.actions.scheduled_cancel, copy.warnings.scheduled_cancel);
      await state({ status: 'canceled' }, null, null, membership);
    } finally {
      await db.delete(subscriptions).where(where);
      // prettier-ignore
      uid ??= (await db.query.user.findFirst({ columns: { id: true }, where: eq(user.email, email) }))?.id ?? null;
      if (uid) {
        await db.delete(authSession).where(eq(authSession.userId, uid));
        await db.delete(account).where(eq(account.userId, uid));
        await db.delete(user).where(eq(user.id, uid));
      }
    }
  });

  for (const [width, height] of VIEWPORTS) {
    test(`keeps reflow and targets: ${width}`, async ({ authenticatedPage: page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await openPortal(page, testInfo);
      const portal = page.getByTestId('member-dashboard-ready').first();
      const regions = portal.locator('section[aria-label]');
      const links = portal.locator('a:visible');
      // prettier-ignore
      const settled = ['article,[role="status"],[role="alert"]', 'a', 'li,[role="status"],[role="alert"]'];
      for (const [index, selector] of settled.entries())
        await expect(regions.nth(index).locator(selector).first()).toBeVisible();

      // prettier-ignore
      expect(await portal.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      // prettier-ignore
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      // prettier-ignore
      expect(await links.evaluateAll(nodes => nodes.every(node => { const box = node.getBoundingClientRect(); return box.height >= 44 && box.width >= 44; }))).toBe(true);

      const nav = portal.getByRole('navigation');
      const help = nav.locator('a').nth(0);
      const cases = nav.locator('a').nth(1);
      const docs = nav.locator('a').nth(2);
      await help.focus();
      await expect(help).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(cases).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(docs).toBeFocused();
    });
  }
});
