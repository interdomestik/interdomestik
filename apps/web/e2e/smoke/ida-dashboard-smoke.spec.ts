import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
// prettier-ignore
const dashboardCases = [{ role: 'member', route: routes.member, marker: 'member-dashboard-ready' }, { role: 'admin', route: routes.admin, marker: 'admin-page-ready' }, { role: 'agent', route: routes.agentMembers, marker: 'agent-members-ready' }, { role: 'staff', route: routes.staffClaims, marker: 'staff-page-ready' }] as const;
async function signInMember(page: Page, origin: string, headers: Record<string, string>) {
  // prettier-ignore
  const response = await page.request.post(`${origin}/api/auth/sign-in/email`, { data: { email: E2E_USERS.KS_MEMBER_EMPTY.email, password: E2E_PASSWORD }, headers: { Origin: origin, Referer: `${origin}${routes.login('en')}`, ...headers } });
  expect(response.ok(), await response.text()).toBe(true);
  // prettier-ignore
  const session = await page.request.get(`${origin}/api/auth/get-session`, { headers: { Origin: origin, ...headers } });
  expect(session.ok(), await session.text()).toBe(true);
  return (await session.json()) as { user: { id: string } };
}
// prettier-ignore
function assertPublicHost(headers: Record<string, string>, origin: string, cookies: Array<{ name: string }>) {
  expect(headers['x-e2e-tenant']).toBe('none');
  expect(headers['x-e2e-tenant-context']).toBe('public');
  expect(cookies.find(cookie => cookie.name === 'tenantId')).toBeUndefined();
  expect(new URL(origin).hostname.startsWith('ida.')).toBe(true);
}
test.describe('@smoke ida.localhost canonical dashboard smoke', () => {
  for (const item of dashboardCases) {
    test(`${item.role} dashboard resolves session context without host tenant`, async ({
      page,
      loginAs,
    }, testInfo) => {
      const baseURL = testInfo.project.use.baseURL?.toString();
      const headers = testInfo.project.use.extraHTTPHeaders ?? {};
      if (!baseURL) throw new Error('smoke-ida requires project.use.baseURL');
      const origin = new URL(baseURL).origin;
      const isIdaHost = new URL(origin).hostname.startsWith('ida.');
      const forwarded = ['x-forwarded', 'host'].join('-');
      test.skip(!isIdaHost, 'ida dashboard smoke only runs in ida projects');
      expect(headers[forwarded]).toBeUndefined();
      expect(headers['x-tenant-id']).toBe('tenant_ks');
      await loginAs(item.role);
      const response = await gotoApp(page, item.route(testInfo), testInfo, {
        marker: item.marker,
        markerTimeoutMs: 30_000,
      });
      assertPublicHost(response?.headers() ?? {}, origin, await page.context().cookies(origin));
      await expect(page.getByTestId(item.marker).first()).toBeVisible();
      // prettier-ignore
      await expect(page.locator('[data-testid="portal-surface-indicator"],[data-testid="sidebar-user-menu-button"],[data-testid="user-nav"]').first()).toBeVisible();
      await expect(page.getByTestId('tenant-chooser')).toHaveCount(0);
      await expect(page.getByTestId('legacy-banner')).toHaveCount(0);
      await expect(page.getByTestId('legacy-surface-ready')).toHaveCount(0);
      if (item.role === 'member')
        await expect(page.getByTestId('member-draft-continuation')).toHaveAttribute(
          'href',
          routes.memberNewClaim(testInfo)
        );
    });
  }
  test('C31 resumes six facts in a fresh same-account session and permanently deletes', async ({
    browser,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL?.toString();
    if (!baseURL) throw new Error('smoke-ida requires project.use.baseURL');
    const origin = new URL(baseURL).origin;
    test.skip(!new URL(origin).hostname.startsWith('ida.'), 'C31 runs only on neutral IDA'); // NOSONAR -- intentional neutral-host gate.
    const headers = testInfo.project.use.extraHTTPHeaders ?? {};
    const summary = `C31-${testInfo.retry} water damaged two rooms.`;
    const empty = { cookies: [], origins: [] };
    const newContext = () =>
      browser.newContext({ baseURL, extraHTTPHeaders: headers, storageState: empty });
    let first: BrowserContext | null = await newContext();
    let second: BrowserContext | null = null;
    try {
      const p1 = await first.newPage();
      await gotoApp(p1, routes.home('en'), testInfo, { marker: 'free-start-intake-shell' });
      await p1.getByTestId('cookie-consent-accept').click();
      const firstSession = await signInMember(p1, origin, headers);
      const flow = p1.getByTestId('premium-free-start-organizer');
      await flow.getByTestId('free-start-manage-open').click();
      await expect(flow.getByRole('heading', { name: 'Your saved drafts' })).toBeFocused();
      await flow.getByTestId('free-start-category-property').click();
      await flow.getByRole('button', { name: 'Continue to guided intake' }).click();
      await flow.getByLabel('What happened?').selectOption('water_damage');
      await flow.getByLabel('When did it happen?').fill('2026-03-01');
      await flow.getByLabel('Who are you dealing with?').fill('C31 Building Insurer');
      await flow.getByLabel('What do you want to recover?').selectOption('repair');
      await flow.getByLabel('Brief summary').fill(summary);
      await flow.getByRole('button', { name: 'Review your summary' }).click();
      await flow.getByTestId('free-start-save-open').click();
      const status = flow.getByTestId('free-start-save-status');
      await expect(status).toHaveAttribute('data-state', 'saved');
      await expect(flow.getByTestId('free-start-save-otp')).toHaveCount(0);
      // prettier-ignore
      const token = (await first.cookies(origin)).find(cookie => cookie.name.includes('session_token'))?.value;
      expect(token).toBeTruthy();
      await first.close();
      first = null;
      second = await newContext();
      const p2 = await second.newPage();
      const secondSession = await signInMember(p2, origin, headers);
      expect(secondSession.user.id).toBe(firstSession.user.id);
      // prettier-ignore
      const nextToken = (await second.cookies(origin)).find(cookie => cookie.name.includes('session_token'))?.value;
      expect(token && nextToken).toBeTruthy();
      expect(nextToken).not.toBe(token);
      // prettier-ignore
      await gotoApp(p2, routes.member('en'), testInfo, { marker: 'member-dashboard-ready' });
      await p2.getByTestId('cookie-consent-accept').click();
      const entry = p2.getByTestId('member-draft-continuation');
      const u = `${routes.memberNewClaim('en')}?mode=drafts`;
      await expect(entry).toHaveAttribute('href', u);
      await entry.click();
      await expect(p2).toHaveURL(`${origin}${u}`);
      const resumed = p2.getByTestId('claim-draft-intake');
      await expect(resumed.getByTestId('free-start-save-open')).toHaveCount(0);
      await resumed.getByTestId('free-start-manage-open').click();
      await expect(resumed.getByRole('heading', { name: 'Your saved drafts' })).toBeFocused();
      const saved = resumed.locator('li').filter({ hasText: summary });
      await saved.getByTestId(/^free-start-resume-/).click();
      const preview = resumed.locator('dl');
      for (const fact of [
        'Property damage',
        'Water damage',
        '2026-03-01',
        'C31 Building Insurer',
        'Repair or replacement costs',
        summary,
      ])
        await expect(preview).toContainText(fact);
      // prettier-ignore
      const submit = resumed.getByRole('button', { name: 'Submit claim — requirements not met' });
      await expect(submit).toBeDisabled();
      await expect(submit).toHaveAccessibleDescription(
        'To submit a claim, you need an active membership. You can keep managing this saved draft; saving it does not submit the claim.'
      );
      await expect(resumed.getByTestId('free-start-save-open')).toHaveCount(0);
      await expect(resumed.getByTestId('claim-created-success')).toHaveCount(0);
      await expect(resumed.getByTestId('claim-pack-result')).toHaveCount(0);
      await expect(resumed.getByTestId('free-start-start-another')).toHaveCount(0);
      await resumed.getByTestId('free-start-manage-open').click();
      await saved.getByTestId(/^free-start-delete-/).click();
      await resumed.getByTestId('free-start-delete-confirm').click();
      const nextStatus = resumed.getByTestId('free-start-save-status');
      await expect(nextStatus).toHaveAttribute('data-state', 'deleted');
    } finally {
      await Promise.all([first?.close(), second?.close()]);
    }
  });
});
