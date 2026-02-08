import { E2E_PASSWORD, claimStageHistory, claims, db, eq, user } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

const PILOT_TENANT_ID = 'pilot-mk';

test.describe('C1 Pilot: Staff to member status loop', () => {
  test('staff status update is visible on member claim detail', async ({
    agentPage,
    browser,
  }, testInfo) => {
    const baseUrl = testInfo.project.use.baseURL;
    if (!baseUrl) {
      throw new Error('Expected project baseURL for pilot host resolution');
    }

    const seededAgent = await db.query.user.findFirst({
      where: eq(user.email, 'agent.pilot@interdomestik.com'),
      columns: { id: true, tenantId: true, branchId: true },
    });

    if (!seededAgent?.id || !seededAgent.tenantId || !seededAgent.branchId) {
      throw new Error('Expected seeded pilot agent with tenantId and branchId');
    }

    const seededPilotStaff = await db.query.user.findFirst({
      where: eq(user.email, 'staff.pilot@interdomestik.com'),
      columns: { id: true, tenantId: true },
    });

    if (!seededPilotStaff?.id || seededPilotStaff.tenantId !== PILOT_TENANT_ID) {
      throw new Error('Expected seeded pilot staff user in pilot-mk tenant');
    }

    const timestamp = Date.now();
    const memberEmail = `member.mk.pilot.c105.${timestamp}@interdomestik.com`;
    const memberName = `Pilot Member C105 ${timestamp}`;
    const claimTitle = `Pilot Status Loop Claim ${timestamp}`;
    const statusNote = `C1-05 status note ${timestamp}`;

    await gotoApp(agentPage, '/en/agent/clients/new', testInfo, { marker: 'dashboard-page-ready' });
    await expect(agentPage.getByTestId('agent-register-member-form')).toBeVisible();

    await agentPage.getByTestId('agent-register-member-full-name').fill(memberName);
    await agentPage.getByTestId('agent-register-member-email').fill(memberEmail);
    await agentPage.getByTestId('agent-register-member-phone').fill('+38970111223');
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
      columns: { id: true },
    });

    if (!createdMember?.id) {
      throw new Error('Created pilot member not found');
    }

    let memberContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;
    let staffContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;

    try {
      memberContext = await browser.newContext({
        baseURL: baseUrl,
        extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
        locale: 'en-US',
      });
      const memberPage = await memberContext.newPage();

      await gotoApp(memberPage, '/en/login', testInfo, { marker: 'body' });
      await memberPage.getByTestId('login-email').fill(memberEmail);
      await memberPage.getByTestId('login-password').fill(E2E_PASSWORD);
      await memberPage.getByTestId('login-submit').click();

      await expect(memberPage).toHaveURL(/\/(?:en\/)?member$/);
      await gotoApp(memberPage, routes.memberNewClaim('en'), testInfo, {
        marker: 'dashboard-page-ready',
      });

      await memberPage.getByTestId('category-vehicle').click();
      await memberPage.getByTestId('wizard-next').click();

      await memberPage.getByTestId('claim-title-input').fill(claimTitle);
      await memberPage.getByTestId('claim-company-input').fill('Pilot MK');
      await memberPage
        .getByTestId('claim-description-input')
        .fill('C1-05 staff to member status loop');
      await memberPage.getByTestId('claim-amount-input').fill('550');
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
        columns: { id: true, userId: true, tenantId: true, branchId: true, staffId: true },
      });

      if (!createdClaim?.id) {
        throw new Error('Created pilot claim not found');
      }

      expect(createdClaim.tenantId).toBe(PILOT_TENANT_ID);
      expect(createdClaim.branchId).toBe(seededAgent.branchId);
      expect(createdClaim.userId).toBe(createdMember.id);
      expect(createdClaim.staffId).toBeNull();

      staffContext = await browser.newContext({
        baseURL: baseUrl,
        extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
        locale: 'en-US',
      });
      const staffPage = await staffContext.newPage();

      await gotoApp(staffPage, '/en/login', testInfo, { marker: 'body' });
      await staffPage.getByTestId('login-email').fill('staff.pilot@interdomestik.com');
      await staffPage.getByTestId('login-password').fill(E2E_PASSWORD);
      await staffPage.getByTestId('login-submit').click();

      await expect(staffPage).toHaveURL(/\/(?:en\/)?staff(?:\/claims)?$/);
      await gotoApp(staffPage, routes.staffClaimDetail(createdClaim.id, 'en'), testInfo, {
        marker: 'staff-claim-detail-ready',
      });

      await expect(staffPage.getByTestId('staff-claim-detail-ready')).toBeVisible();
      await expect(staffPage.getByTestId('staff-claim-action-panel')).toBeVisible();

      const assignButton = staffPage.getByTestId('staff-assign-claim-button');
      if (await assignButton.isVisible()) {
        await assignButton.click();
      }

      await expect
        .poll(
          async () => {
            const assigned = await db.query.claims.findFirst({
              where: eq(claims.id, createdClaim.id),
              columns: { staffId: true },
            });
            return assigned?.staffId ?? null;
          },
          { timeout: 15_000 }
        )
        .toBe(seededPilotStaff.id);

      await staffPage.getByLabel('Update Status').click();
      await staffPage.getByRole('option', { name: 'Evaluation' }).click();
      await staffPage.getByLabel('Status Note (Visible to member)').fill(statusNote);
      await staffPage.getByRole('button', { name: 'Update Claim' }).click();

      await expect
        .poll(
          async () => {
            const updated = await db.query.claims.findFirst({
              where: eq(claims.id, createdClaim.id),
              columns: { status: true },
            });
            return updated?.status ?? null;
          },
          { timeout: 15_000 }
        )
        .toBe('evaluation');

      await expect
        .poll(
          async () => {
            const event = await db.query.claimStageHistory.findFirst({
              where: eq(claimStageHistory.claimId, createdClaim.id),
              columns: { note: true, toStatus: true },
              orderBy: (table, { desc }) => [desc(table.createdAt), desc(table.id)],
            });
            if (!event) return null;
            return `${event.toStatus ?? ''}|${event.note ?? ''}`;
          },
          { timeout: 15_000 }
        )
        .toBe(`evaluation|${statusNote}`);

      await gotoApp(memberPage, routes.memberClaimDetail(createdClaim.id, 'en'), testInfo, {
        marker: 'ops-status-badge',
      });

      await expect(memberPage.getByTestId('ops-status-badge')).toContainText('EVALUATION');
      await expect(memberPage.getByTestId('ops-timeline')).toBeVisible();
      await expect(memberPage.getByText(statusNote)).toBeVisible();
    } finally {
      await staffContext?.close();
      await memberContext?.close();
    }
  });
});
