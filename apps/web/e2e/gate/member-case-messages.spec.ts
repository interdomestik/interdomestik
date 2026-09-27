import { claimMessages, db } from '@interdomestik/database';
import { getMessagesForClaimCore } from '@interdomestik/domain-communications/messages/get';
import { markMessagesAsReadCore } from '@interdomestik/domain-communications/messages/mark-read';
import { sendMessageDbCore } from '@interdomestik/domain-communications/messages/send';
import { eq, inArray } from 'drizzle-orm';
import en from '../../src/messages/en/messaging.json';
import mk from '../../src/messages/mk/messaging.json';
import sq from '../../src/messages/sq/messaging.json';
import sr from '../../src/messages/sr/messaging.json';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { withMemberMessageFixture } from './member-case-messages.fixture';

const copy = { en, mk, sq, sr };

test.describe('Member case communication', () => {
  test('real actions protect public thread and read receipts across member and tenant boundaries', async ({}, info) => {
    await withMemberMessageFixture(info, async fixture => {
      const session = {
        user: { id: fixture.memberId, role: 'member', tenantId: fixture.tenantId },
      };
      const read = await getMessagesForClaimCore({ session, claimId: fixture.claimId });
      expect(read.success).toBe(true);
      expect(read.messages?.map(message => message.id)).toEqual([fixture.messageIds[0]]);
      for (const claimId of fixture.deniedIds) {
        expect((await getMessagesForClaimCore({ session, claimId })).success).toBe(false);
        expect(
          (
            await sendMessageDbCore({
              session,
              claimId,
              content: 'Denied write',
              requestHeaders: new Headers(),
            })
          ).success
        ).toBe(false);
      }
      expect(
        (
          await sendMessageDbCore({
            session,
            claimId: fixture.claimId,
            content: 'Denied internal',
            isInternal: true,
            requestHeaders: new Headers(),
          })
        ).success
      ).toBe(false);
      expect(
        (await getMessagesForClaimCore({ session: null, claimId: fixture.claimId })).success
      ).toBe(false);
      expect(
        (await markMessagesAsReadCore({ session, messageIds: fixture.messageIds })).success
      ).toBe(true);
      const rows = await db
        .select()
        .from(claimMessages)
        .where(inArray(claimMessages.id, fixture.messageIds));
      expect(rows.filter(row => row.readAt !== null).map(row => row.id)).toEqual([
        fixture.messageIds[0],
      ]);
    });
  });

  test('eligible member exchanges public case messages and retains localized accessible controls', async ({
    authenticatedPage: page,
    staffPage,
  }, info) => {
    test.setTimeout(120_000);
    await withMemberMessageFixture(info, async fixture => {
      const locales = info.project.name.includes('mk')
        ? (['mk', 'sr'] as const)
        : (['sq', 'en'] as const);
      for (const locale of locales) {
        await gotoApp(page, routes.memberClaimDetail(fixture.claimId, locale), info, {
          marker: 'member-claim-detail-messaging',
        });
        const panel = page
          .getByTestId('member-claim-detail-messaging')
          .getByTestId('messaging-panel');
        const text = copy[locale].messaging;
        await expect(panel).toContainText('Your case update is available.');
        await expect(panel).not.toContainText('Private sentinel');
        await expect(panel.getByTestId('internal-note-toggle')).toHaveCount(0);
        await expect(
          panel.getByRole('button', { name: text.member.refresh, exact: true })
        ).toBeVisible();
        const input = panel.getByRole('textbox', { name: text.member.label });
        await input.fill(`Member reply ${locale} ${fixture.claimId}`);
        await input.press('Control+Enter');
        await expect(input).toHaveValue('');
        await expect(panel).toContainText(`Member reply ${locale} ${fixture.claimId}`);
        await page.setViewportSize({ width: 320, height: 740 });
        expect(
          await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)
        ).toBe(true);
      }
      await gotoApp(staffPage, routes.staffClaimDetail(fixture.claimId, info), info, {
        marker: 'staff-claim-detail-ready',
      });
      const staffPanel = staffPage
        .locator('[data-testid="staff-claim-detail-ready"]:visible')
        .last()
        .getByTestId('messaging-panel');
      await expect(staffPanel).toContainText(`Member reply ${locales[1]} ${fixture.claimId}`);
      await staffPanel.getByTestId('message-input').fill(`Staff reply ${fixture.claimId}`);
      await staffPanel.getByTestId('send-message-button').click();
      await expect
        .poll(async () =>
          (
            await db.query.claimMessages.findMany({
              where: eq(claimMessages.claimId, fixture.claimId),
            })
          ).some(message => message.content === `Staff reply ${fixture.claimId}`)
        )
        .toBe(true);
      await page
        .getByTestId('messaging-panel')
        .getByRole('button', { name: copy[locales[1]].messaging.member.refresh, exact: true })
        .click();
      await expect(page.getByTestId('member-claim-detail-messaging')).toContainText(
        `Staff reply ${fixture.claimId}`
      );
      await expect(page.getByTestId('member-claim-detail-messaging')).not.toContainText(
        'Private sentinel'
      );
      for (const deniedId of fixture.deniedIds) {
        await page.goto(
          new URL(routes.memberClaimDetail(deniedId, locales[1]), page.url()).toString()
        );
        await expect(page.getByTestId('member-claim-detail-messaging')).toHaveCount(0);
        await expect(page.getByTestId('member-claim-current-state')).toHaveCount(0);
        await expect(page.locator('body')).not.toContainText('Private sentinel');
        await expect(page.locator('body')).not.toContainText(deniedId);
      }
    });
  });
});
