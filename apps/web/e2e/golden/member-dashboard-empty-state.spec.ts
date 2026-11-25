// prettier-ignore
import { account, and, db, E2E_PASSWORD, eq, session as authSession, user } from '@interdomestik/database';
import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/auth.fixture';
import { fixtureLegalAcceptance } from '../fixtures/legal-acceptance.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import en from '../../src/messages/en/dashboard.json';
import mk from '../../src/messages/mk/dashboard.json';
import sq from '../../src/messages/sq/dashboard.json';
import sr from '../../src/messages/sr/dashboard.json';

const C = { de: sq, en, hr: sq, mk, sq, sr };

test.describe('Empty portal', () => {
  test('settles empty portal', async ({ page }, testInfo) => {
    const tenantId = testInfo.project.name.includes('mk') ? 'tenant_mk' : 'tenant_ks';
    const fixtureId = `t117b-empty-${testInfo.project.name}-${testInfo.workerIndex}-${testInfo.retry}-${randomUUID()}`;
    const email = `${fixtureId}@example.test`;
    const origin = new URL(String(testInfo.project.use.baseURL)).origin;
    const findMember = () =>
      db.query.user.findFirst({
        columns: { id: true, tenantId: true, email: true },
        where: and(eq(user.email, email), eq(user.tenantId, tenantId)),
      });
    let member: Awaited<ReturnType<typeof findMember>>;

    try {
      // prettier-ignore
      const signup = await page.request.post(`${origin}/api/auth/sign-up/email`, { data: { email, name: 'T117B empty', onboarding: { mode: 'resolved', tenant: tenantId }, password: E2E_PASSWORD }, headers: { Origin: origin, Referer: `${origin}/register` } });
      if (!signup.ok()) throw new Error(`T117B empty signup failed: ${await signup.text()}`);
      member = await findMember();
      if (!member) throw new Error('T117B empty member was not created in the expected tenant');
      await fixtureLegalAcceptance('seed', [member]);
      await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'member-dashboard-ready' });

      const regions = page.getByTestId('member-dashboard-ready').locator('section[aria-label]');
      const copy = C[routes.getLocale(testInfo)].dashboard.portal;
      const navigation = page.getByTestId('member-dashboard-ready').getByRole('navigation');
      const membership = `${routes.member(testInfo)}/membership`;
      await expect(navigation.locator('a')).toHaveCount(4);

      await expect(regions.nth(0).getByRole('status')).toBeVisible();
      await expect(regions.nth(0).getByRole('status')).toHaveAccessibleName(
        copy.regions.case.label
      );
      await expect(regions.nth(0).getByRole('article')).toHaveCount(0);
      await expect(regions.nth(1).getByRole('link')).toHaveAttribute('href', membership);
      await expect(navigation.locator('a').nth(2)).toHaveAttribute('href', membership);
      await expect(regions.nth(2).getByRole('status')).toBeVisible();
      await expect(regions.nth(2).getByRole('listitem')).toHaveCount(0);
    } finally {
      if (member) await fixtureLegalAcceptance('clean', [member]);
      const userId = member?.id ?? (await findMember())?.id;
      if (userId) {
        await db.delete(authSession).where(eq(authSession.userId, userId));
        await db.delete(account).where(eq(account.userId, userId));
        await db.delete(user).where(eq(user.id, userId));
      }
    }
  });
});
