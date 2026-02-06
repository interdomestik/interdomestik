import { E2E_PASSWORD, db, eq, subscriptions, user } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';

const PILOT_TENANT_ID = 'pilot-mk';
const PILOT_HOST = 'pilot.127.0.0.1.nip.io:3000';
const KS_HOST = 'ks.127.0.0.1.nip.io:3000';

test.describe('C1 Pilot: Agent Member Provisioning', () => {
  test('agent creates member with inherited tenant+branch and member stays isolated from KS host', async ({
    agentPage,
    browser,
  }, testInfo) => {
    const seededAgent = await db.query.user.findFirst({
      where: eq(user.email, 'agent.pilot@interdomestik.com'),
      columns: { id: true, branchId: true, tenantId: true },
    });

    if (!seededAgent?.id || !seededAgent.tenantId || !seededAgent.branchId) {
      throw new Error('Expected seeded pilot agent with tenantId and branchId');
    }
    const agentBranch = seededAgent.branchId;

    const timestamp = Date.now();
    const memberEmail = `member.mk.pilot.${timestamp}@interdomestik.com`;
    const memberName = `Pilot Member ${timestamp}`;

    await gotoApp(agentPage, '/en/agent/clients/new', testInfo, { marker: 'dashboard-page-ready' });
    await expect(agentPage.getByTestId('agent-register-member-form')).toBeVisible();

    await agentPage.getByTestId('agent-register-member-full-name').fill(memberName);
    await agentPage.getByTestId('agent-register-member-email').fill(memberEmail);
    await agentPage.getByTestId('agent-register-member-phone').fill('+38970111222');
    await agentPage.getByTestId('agent-register-member-password').fill(E2E_PASSWORD);
    await agentPage.getByTestId('agent-register-member-plan-trigger').click();
    await agentPage.getByTestId('agent-register-member-plan-standard').click();
    await agentPage.getByTestId('agent-register-member-submit').click();

    await expect(agentPage).toHaveURL(/\/(?:en\/)?agent\/clients$/);

    await expect
      .poll(
        async () => {
          const created = await db.query.user.findFirst({
            where: eq(user.email, memberEmail),
            columns: { id: true },
          });
          return created?.id ?? null;
        },
        { timeout: 15_000 }
      )
      .not.toBeNull();

    const createdMember = await db.query.user.findFirst({
      where: eq(user.email, memberEmail),
      columns: { id: true, email: true, role: true, tenantId: true, branchId: true, agentId: true },
    });

    if (!createdMember?.id) {
      throw new Error('Created member not found in database');
    }

    expect(createdMember.role).toBe('member');
    expect(createdMember.tenantId).toBe(PILOT_TENANT_ID);
    expect(createdMember.branchId).toBe(agentBranch);
    expect(createdMember.agentId).toBe(seededAgent.id);

    const createdSubscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, createdMember.id),
      columns: { id: true, tenantId: true, branchId: true, agentId: true, status: true },
    });

    if (!createdSubscription?.id) {
      throw new Error('Created subscription not found in database');
    }

    expect(createdSubscription.tenantId).toBe(PILOT_TENANT_ID);
    expect(createdSubscription.branchId).toBe(agentBranch);
    expect(createdSubscription.agentId).toBe(seededAgent.id);
    expect(createdSubscription.status).toBe('active');

    const memberContext = await browser.newContext({
      baseURL: `http://${PILOT_HOST}/en`,
      extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
      locale: 'en-US',
    });
    const memberPage = await memberContext.newPage();

    await memberPage.goto('/en/login');
    await memberPage.getByTestId('login-email').fill(memberEmail);
    await memberPage.getByTestId('login-password').fill(E2E_PASSWORD);
    await memberPage.getByTestId('login-submit').click();

    await expect(memberPage).toHaveURL(/\/(?:en\/)?member$/);
    await expect(memberPage.getByTestId('member-dashboard-ready')).toBeVisible();

    const ksContext = await browser.newContext({
      baseURL: `http://${KS_HOST}/en`,
      extraHTTPHeaders: { 'x-forwarded-host': KS_HOST },
      locale: 'en-US',
      storageState: await memberContext.storageState(),
    });
    const ksPage = await ksContext.newPage();

    await ksPage.goto('/en/member', { waitUntil: 'domcontentloaded' });
    await expect(ksPage).not.toHaveURL(/\/(?:en\/)?member$/);
    await expect(ksPage).toHaveURL(/\/(?:en\/)?login/);

    await ksContext.close();
    await memberContext.close();
  });
});
