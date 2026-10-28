import { auditLog, claimMessages, claims, dbAdmin, notifications } from '@interdomestik/database';
import { and, eq, inArray } from 'drizzle-orm';
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { credsFor } from '../fixtures/auth-users';
import { getProjectUrlInfo, ipForRole } from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { withAgentMessageFixture } from './agent-message-visibility.fixture';

async function signInFixtureUser(
  page: Page,
  info: TestInfo,
  role: 'agent' | 'member' | 'staff',
  email: string,
  userId: string
) {
  const { origin } = getProjectUrlInfo(info, null);
  await page.context().clearCookies();
  const login = await page.request.post(`${origin}/api/auth/sign-in/email`, {
    data: {
      email,
      password: credsFor(role, info.project.name.includes('mk') ? 'mk' : 'ks').password,
    },
    headers: {
      Origin: origin,
      'x-forwarded-for': ipForRole(role),
      ...info.project.use.extraHTTPHeaders,
    },
  });
  expect(login.ok()).toBeTruthy();
  expect((await login.json()).user.id).toBe(userId);
}

test('synthetic member message reaches assigned staff, whose public acknowledgement reaches agent and member', async ({
  page: agentPage,
  browser,
}, info) => {
  test.setTimeout(180_000);
  await withAgentMessageFixture(info.project.name, async fixture => {
    const claimId = fixture.claimIds[0];
    const memberText = `S8 member handoff ${claimId}`;
    const staffText = `S8 assigned staff acknowledgement ${claimId}`;
    const agentText = `S8 agent acknowledgement ${claimId}`;
    const newContext = () =>
      browser.newContext({
        baseURL: info.project.use.baseURL,
        extraHTTPHeaders: info.project.use.extraHTTPHeaders,
        storageState: { cookies: [], origins: [] },
      });
    const memberContext = await newContext();
    const staffContext = await newContext();
    try {
      const memberPage = await memberContext.newPage();
      const staffPage = await staffContext.newPage();
      await signInFixtureUser(memberPage, info, 'member', fixture.memberEmail, fixture.memberId);
      await signInFixtureUser(staffPage, info, 'staff', fixture.staffEmail, fixture.staffId);
      await signInFixtureUser(agentPage, info, 'agent', fixture.email, fixture.agentId);

      expect(
        (await dbAdmin.query.claims.findFirst({ where: eq(claims.id, claimId) }))?.staffId
      ).toBe(fixture.staffId);
      await gotoApp(memberPage, routes.memberClaimDetail(claimId, info), info, {
        marker: 'member-claim-detail-messaging',
      });
      const memberPanel = memberPage
        .locator('[data-testid="member-claim-detail-messaging"]:visible')
        .last()
        .getByTestId('messaging-panel');
      await expect(memberPanel.getByTestId('internal-note-toggle')).toHaveCount(0);
      await expect(memberPanel).toContainText('S1 public read');
      await expect(memberPanel).not.toContainText('S1 old internal');
      await expect(memberPanel).not.toContainText('S1 newest internal secret');
      await expect(memberPanel).not.toContainText('S1 foreign message secret');
      await memberPanel.getByTestId('message-input').fill(memberText);
      await memberPanel.getByTestId('send-message-button').click();
      await expect(memberPanel).toContainText(memberText);

      await gotoApp(staffPage, routes.staffClaimDetail(claimId, info), info, {
        marker: 'staff-claim-detail-ready',
      });
      const staffPanel = staffPage
        .locator('[data-testid="staff-claim-detail-ready"]:visible')
        .last()
        .getByTestId('messaging-panel');
      await expect(staffPanel).toContainText(memberText);
      await staffPanel.getByTestId('message-input').fill(staffText);
      await staffPanel.getByTestId('send-message-button').click();
      await expect(staffPanel).toContainText(staffText);

      await gotoApp(agentPage, `${routes.agentWorkspaceClaims(info)}?claimId=${claimId}`, info, {
        marker: 'agent-claims-pro-page',
      });
      const drawer = agentPage.locator('[data-testid="ops-drawer"]:visible');
      await expect(drawer.getByTestId('workspace-selected-claim-id')).toHaveText(claimId);
      await drawer.getByTestId('action-message').click();
      const agentPanel = agentPage.getByTestId('messaging-panel');
      await expect(agentPanel).toContainText(memberText);
      await expect(agentPanel).toContainText(staffText);
      await expect(agentPage.getByTestId('messaging-public-audience')).toBeVisible();
      await expect(agentPanel.getByTestId('internal-note-toggle')).toHaveCount(0);
      await expect(agentPanel).not.toContainText('S1 old internal');
      await expect(agentPanel).not.toContainText('S1 newest internal secret');
      await expect(agentPanel).not.toContainText('S1 foreign message secret');
      await agentPanel.getByTestId('message-input').fill(agentText);
      await agentPanel.getByTestId('send-message-button').click();
      await expect(agentPanel).toContainText(agentText);

      await memberPage.reload();
      await expect(memberPanel).toContainText(staffText);
      await expect(memberPanel).toContainText(agentText);
      await expect(memberPanel).not.toContainText('S1 old internal');
      await expect(memberPanel).not.toContainText('S1 newest internal secret');
      await expect(memberPanel).not.toContainText('S1 foreign message secret');
      const messages = await dbAdmin.query.claimMessages.findMany({
        where: eq(claimMessages.claimId, claimId),
      });
      expect(messages.filter(message => message.content === memberText)).toEqual([
        expect.objectContaining({ senderId: fixture.memberId, isInternal: false }),
      ]);
      expect(messages.filter(message => message.content === staffText)).toEqual([
        expect.objectContaining({ senderId: fixture.staffId, isInternal: false }),
      ]);
      expect(messages.filter(message => message.content === agentText)).toEqual([
        expect.objectContaining({ senderId: fixture.agentId, isInternal: false }),
      ]);
      const notificationIds = [memberText, staffText, agentText].map(content => {
        const message = messages.find(row => row.content === content);
        if (!message) throw new Error('Expected persisted S8 public message');
        return `ntf_new_message_${message.id}`;
      });
      await expect
        .poll(() =>
          dbAdmin.query.notifications.findMany({
            where: inArray(notifications.id, notificationIds),
          })
        )
        .toEqual([
          expect.objectContaining({
            id: notificationIds[1],
            tenantId: fixture.tenantId,
            userId: fixture.memberId,
            type: 'new_message',
          }),
        ]);
      expect(
        (await dbAdmin.query.claims.findFirst({ where: eq(claims.id, claimId) }))?.staffId
      ).toBe(fixture.staffId);
      const auditRows = await dbAdmin.query.auditLog.findMany({
        where: and(eq(auditLog.action, 'claim.message_sent'), eq(auditLog.entityId, claimId)),
      });
      expect(auditRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tenantId: fixture.tenantId,
            actorId: fixture.memberId,
            entityType: 'claim',
            metadata: expect.objectContaining({ internal: false }),
          }),
          expect.objectContaining({
            tenantId: fixture.tenantId,
            actorId: fixture.staffId,
            entityType: 'claim',
            metadata: expect.objectContaining({ internal: false }),
          }),
          expect.objectContaining({
            tenantId: fixture.tenantId,
            actorId: fixture.agentId,
            entityType: 'claim',
            metadata: expect.objectContaining({ internal: false }),
          }),
        ])
      );
      expect(auditRows).toHaveLength(3);
      expect(
        (await dbAdmin.query.claims.findFirst({ where: eq(claims.id, claimId) }))?.staffId
      ).toBe(fixture.staffId);
    } finally {
      await memberContext.close();
      await staffContext.close();
    }
  });
});
