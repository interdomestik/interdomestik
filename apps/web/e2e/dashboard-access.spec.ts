import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Dashboard Access Verification', () => {
  test('Member.ks.a1 should land on /member and see member dashboard', async ({
    authenticatedPage: page,
  }, testInfo) => {
    // authenticatedPage fixture defaults to member login (member.ks.a1)
    await gotoApp(page, routes.member(), testInfo);

    // URL verification
    expect(page.url()).toContain('/member');

    // Dashboard markers
    await expect(page.getByTestId('member-dashboard-ready')).toBeVisible();
    await expect(page.getByTestId('dashboard-heading')).toBeVisible();
  });

  test('Agent.ks.a1 should land on /agent and see agent dashboard', async ({
    agentPage: page,
  }, testInfo) => {
    // agentPage fixture uses agent.ks.a1
    await gotoApp(page, routes.agent(), testInfo);

    // URL verification
    expect(page.url()).toContain('/agent');

    // Dashboard markers
    await expect(page.getByTestId('dashboard-page-ready')).toBeVisible();

    // Check for agent-specific elements using more specific locators
    await expect(page.getByRole('heading', { name: /New Leads|Leads të Reja/i })).toBeVisible();
    await expect(page.getByText(/Commission Summary|Përmbledhja e Provizioneve/i)).toBeVisible();
  });

  test('Member should not be able to access /agent area', async ({
    authenticatedPage: page,
  }, testInfo) => {
    // Attempt to navigate to agent portal as a regular member
    const response = await gotoApp(page, routes.agent(), testInfo);

    // Should be a 404 (as per layout logic: session.user.role !== 'agent' -> notFound())
    // Or redirected if middleware/layout handles it differently
    // In apps/web/src/app/[locale]/(agent)/agent/layout.tsx it calls notFound()

    expect(response?.status()).toBe(404);
  });

  test('Agent should be able to access member dashboard (Unified Role)', async ({
    agentPage: page,
  }, testInfo) => {
    // In V3, Agents are also Members and can see the member dashboard
    await gotoApp(page, routes.member(), testInfo);

    expect(page.url()).toContain('/member');
    await expect(page.getByTestId('member-dashboard-ready')).toBeVisible();
  });
});
