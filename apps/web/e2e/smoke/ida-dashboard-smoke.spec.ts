import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
const canonicalDashboardCases = [
  { role: 'member', route: routes.member, marker: 'member-dashboard-ready' },
  { role: 'admin', route: routes.admin, marker: 'admin-page-ready' },
  { role: 'agent', route: routes.agentMembers, marker: 'agent-members-ready' },
  { role: 'staff', route: routes.staffClaims, marker: 'staff-page-ready' },
] as const;

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
function assertNoHostTenantContext(responseHeaders: Record<string, string>, origin: string, cookies: Array<{ name: string }>) {
  expect(responseHeaders['x-e2e-tenant']).toBe('none');
  expect(responseHeaders['x-e2e-tenant-context']).toBe('public');
  expect(cookies.find(cookie => cookie.name === 'tenantId')).toBeUndefined();
  expect(new URL(origin).hostname.startsWith('ida.')).toBe(true);
}

test.describe('@smoke ida.localhost canonical dashboard smoke', () => {
  for (const scenario of canonicalDashboardCases) {
    test(`${scenario.role} dashboard resolves session context without host tenant`, async ({
      page,
      loginAs,
    }, testInfo) => {
      const baseURL = testInfo.project.use.baseURL?.toString();
      const projectHeaders = testInfo.project.use.extraHTTPHeaders ?? {};
      if (!baseURL) throw new Error('smoke-ida requires project.use.baseURL');

      const origin = new URL(baseURL).origin;
      const isIdaHost = new URL(origin).hostname.startsWith('ida.');
      const forwardedHostHeader = ['x-forwarded', 'host'].join('-');
      test.skip(!isIdaHost, 'ida dashboard smoke only runs in ida projects');

      expect(projectHeaders[forwardedHostHeader]).toBeUndefined();
      expect(projectHeaders['x-tenant-id']).toBe('tenant_ks');
      await loginAs(scenario.role);

      const response = await gotoApp(page, scenario.route(testInfo), testInfo, {
        marker: scenario.marker,
        markerTimeoutMs: 30_000,
      });

      assertNoHostTenantContext(
        response?.headers() ?? {},
        origin,
        await page.context().cookies(origin)
      );
      await expect(page.getByTestId(scenario.marker).first()).toBeVisible();
      // prettier-ignore
      await expect(page.locator('[data-testid="portal-surface-indicator"],[data-testid="sidebar-user-menu-button"],[data-testid="user-nav"]').first()).toBeVisible();
      await expect(page.getByTestId('tenant-chooser')).toHaveCount(0);
      await expect(page.getByTestId('legacy-banner')).toHaveCount(0);
      await expect(page.getByTestId('legacy-surface-ready')).toHaveCount(0);
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
    const createContext = () =>
      browser.newContext({ baseURL, extraHTTPHeaders: headers, storageState: empty });
    let first: BrowserContext | null = await createContext();
    let second: BrowserContext | null = null;
    try {
      const p1 = await first.newPage();
      await gotoApp(p1, routes.home('en'), testInfo, { marker: 'free-start-intake-shell' });
      const firstSession = await signInMember(p1, origin, headers);
      const organizer = p1.getByTestId('premium-free-start-organizer');
      await organizer.getByTestId('free-start-manage-open').click();
      await expect(organizer.getByRole('heading', { name: 'Your saved drafts' })).toBeFocused();
      await organizer.getByTestId('free-start-category-property').click();
      await organizer.getByRole('button', { name: 'Continue to guided intake' }).click();
      await organizer.getByLabel('What happened?').selectOption('water_damage');
      await organizer.getByLabel('When did it happen?').fill('2026-03-01');
      await organizer.getByLabel('Who are you dealing with?').fill('C31 Building Insurer');
      await organizer.getByLabel('What do you want to recover?').selectOption('repair');
      await organizer.getByLabel('Brief summary').fill(summary);
      await organizer.getByRole('button', { name: 'Review your summary' }).click();
      await organizer.getByTestId('free-start-save-open').click();
      const status = organizer.getByTestId('free-start-save-status');
      await expect(status).toHaveAttribute('data-state', 'saved');
      await expect(organizer.getByTestId('free-start-save-otp')).toHaveCount(0);
      // prettier-ignore
      const token = (await first.cookies(origin)).find(cookie => cookie.name.includes('session_token'))?.value;
      expect(token).toBeTruthy();
      await first.close();
      first = null;
      second = await createContext();
      const p2 = await second.newPage();
      const secondSession = await signInMember(p2, origin, headers);
      expect(secondSession.user.id).toBe(firstSession.user.id);
      // prettier-ignore
      const nextToken = (await second.cookies(origin)).find(cookie => cookie.name.includes('session_token'))?.value;
      expect(token && nextToken).toBeTruthy();
      expect(nextToken).not.toBe(token);
      // prettier-ignore
      await gotoApp(p2, routes.member('en'), testInfo, { marker: 'member-dashboard-ready' });
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
      await expect(resumed.getByRole('button', { name: 'Submit claim — not available yet' })).toBeDisabled();
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
