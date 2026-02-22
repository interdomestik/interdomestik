import { E2E_PASSWORD, claims, db, eq, user } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';

const PILOT_TENANT_ID = 'pilot-mk';
const PILOT_HOST = 'pilot.127.0.0.1.nip.io:3000';
const KS_HOST = 'ks.127.0.0.1.nip.io:3000';

test.describe('C1 Pilot: Staff claim triage', () => {
  test('member submits claim, pilot staff sees it and self-assigns, KS host remains isolated', async ({
    agentPage,
    browser,
  }, testInfo) => {
    const seededAgent = await db.query.user.findFirst({
      where: eq(user.email, 'agent.pilot@interdomestik.com'),
      columns: { id: true, tenantId: true, branchId: true },
    });

    if (!seededAgent?.id || !seededAgent.tenantId || !seededAgent.branchId) {
      throw new Error('Expected seeded pilot agent with tenantId and branchId');
    }

    const seededPilotStaff = await db.query.user.findFirst({
      where: eq(user.email, 'staff.pilot@interdomestik.com'),
      columns: { id: true, tenantId: true, branchId: true },
    });

    if (
      !seededPilotStaff?.id ||
      seededPilotStaff.tenantId !== PILOT_TENANT_ID ||
      !seededPilotStaff.branchId
    ) {
      throw new Error('Expected seeded pilot staff user in pilot-mk tenant');
    }
    const alignedBranchId = seededPilotStaff.branchId;

    if (seededAgent.branchId !== alignedBranchId) {
      throw new Error(
        `Seed precondition mismatch: agent.pilot branch (${seededAgent.branchId}) must match staff branch (${alignedBranchId})`
      );
    }

    const timestamp = Date.now();
    const memberEmail = `member.mk.pilot.c104.${timestamp}@interdomestik.com`;
    const memberName = `Pilot Member C104 ${timestamp}`;
    const claimTitle = `Pilot Staff Claim ${timestamp}`;

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
          const createdMember = await db.query.user.findFirst({
            where: eq(user.email, memberEmail),
            columns: { id: true },
          });
          return createdMember?.id ?? null;
        },
        { timeout: 15_000 }
      )
      .not.toBeNull();

    const createdMember = await db.query.user.findFirst({
      where: eq(user.email, memberEmail),
      columns: { id: true, tenantId: true, branchId: true },
    });

    if (!createdMember?.id) {
      throw new Error('Created pilot member not found');
    }

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
    await gotoApp(memberPage, '/en/member/claims/new', testInfo);
    await memberPage.getByTestId('category-vehicle').click();
    await memberPage.getByTestId('wizard-next').click();

    await memberPage.getByTestId('claim-title-input').fill(claimTitle);
    await memberPage.getByTestId('claim-company-input').fill('Pilot MK');
    await memberPage.getByTestId('claim-description-input').fill('C1-04 staff triage pilot proof');
    await memberPage.getByTestId('claim-amount-input').fill('450');
    await memberPage.getByTestId('claim-date-input').fill(new Date().toISOString().split('T')[0]);
    await memberPage.getByTestId('wizard-next').click();
    await memberPage.getByTestId('wizard-next').click();
    await memberPage.getByTestId('wizard-submit').click();

    await expect(memberPage).toHaveURL(/\/(?:en\/)?member\/claims$/);

    await expect
      .poll(
        async () => {
          const createdClaim = await db.query.claims.findFirst({
            where: eq(claims.title, claimTitle),
            columns: { id: true },
          });
          return createdClaim?.id ?? null;
        },
        { timeout: 20_000 }
      )
      .not.toBeNull();

    const createdClaim = await db.query.claims.findFirst({
      where: eq(claims.title, claimTitle),
      columns: { id: true, tenantId: true, branchId: true, staffId: true, userId: true },
    });

    if (!createdClaim?.id) {
      throw new Error('Created pilot claim not found');
    }

    expect(createdClaim.tenantId).toBe(PILOT_TENANT_ID);
    expect(createdClaim.branchId).toBe(alignedBranchId);
    expect(createdClaim.userId).toBe(createdMember.id);
    expect(createdClaim.staffId).toBeNull();

    const staffContext = await browser.newContext({
      baseURL: `http://${PILOT_HOST}/en`,
      extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
      locale: 'en-US',
    });
    const staffPage = await staffContext.newPage();

    await staffPage.goto('/en/login');
    await staffPage.getByTestId('login-email').fill('staff.pilot@interdomestik.com');
    await staffPage.getByTestId('login-password').fill(E2E_PASSWORD);
    await staffPage.getByTestId('login-submit').click();

    await expect(staffPage).toHaveURL(/\/(?:en\/)?staff(?:\/claims)?$/);
    await gotoApp(staffPage, '/en/staff/claims', testInfo, { marker: 'staff-page-ready' });

    const reviewLink = staffPage.locator(`a[href$="/staff/claims/${createdClaim.id}"]`);
    await expect(reviewLink).toBeVisible();
    await gotoApp(staffPage, `/en/staff/claims/${createdClaim.id}`, testInfo);
    await expect(staffPage).toHaveURL(new RegExp(`/staff/claims/${createdClaim.id}$`));
    await expect(staffPage.getByTestId('staff-claim-detail-ready')).toBeVisible();
    await staffPage.getByTestId('staff-assign-claim-button').click();

    await expect
      .poll(
        async () => {
          const assigned = await db.query.claims.findFirst({
            where: eq(claims.id, createdClaim.id),
            columns: { staffId: true, tenantId: true },
          });
          return assigned?.staffId ?? null;
        },
        { timeout: 15_000 }
      )
      .toBe(seededPilotStaff.id);

    const ksContext = await browser.newContext({
      baseURL: `http://${KS_HOST}/en`,
      extraHTTPHeaders: { 'x-forwarded-host': KS_HOST },
      locale: 'en-US',
      storageState: await staffContext.storageState(),
    });
    const ksPage = await ksContext.newPage();

    await ksPage.goto('/en/staff/claims', { waitUntil: 'domcontentloaded' });
    await expect(ksPage).not.toHaveURL(/\/(?:en\/)?staff\/claims$/);
    await expect(ksPage).toHaveURL(/\/(?:en\/)?login/);

    await ksContext.close();
    await staffContext.close();
    await memberContext.close();
  });
});
