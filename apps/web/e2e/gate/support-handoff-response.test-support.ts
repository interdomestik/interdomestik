import { db, eq, supportHandoffs } from '@interdomestik/database';
import type { Locator, Page } from '@playwright/test';
import { expect } from '../fixtures/auth.fixture';

export async function openSupportHandoffDetail(row: Locator): Promise<void> {
  const toggle = row.getByTestId('staff-support-handoff-detail-toggle');
  const panel = row.getByTestId('staff-support-handoff-detail-panel');
  await expectVisible(row.locator('[data-hydrated="true"]'));
  await expectVisible(toggle);
  await expect(async () => {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 1000 });
    await expect(panel).toBeVisible({ timeout: 1000 });
  }).toPass({ intervals: [250, 500, 1000], timeout: 15000 });
}

export const expectVisible = (locator: Locator) => expect(locator).toBeVisible({ timeout: 15000 });

export async function expectPublicResponseVersion(
  subject: string,
  response: string,
  version: number
): Promise<void> {
  await expect
    .poll(
      async () => {
        const handoff = await db.query.supportHandoffs.findFirst({
          where: eq(supportHandoffs.subject, subject),
          columns: {
            publicResponse: true,
            publicResponseAt: true,
            publicResponseVersion: true,
          },
        });

        return handoff?.publicResponse === response && handoff.publicResponseAt
          ? handoff.publicResponseVersion
          : null;
      },
      { timeout: 15000, intervals: [250, 500, 1000] }
    )
    .toBe(version);
}

export async function expectPublicResponseAcknowledgedVersion(
  subject: string,
  version: number
): Promise<void> {
  await expect
    .poll(
      async () => {
        const handoff = await db.query.supportHandoffs.findFirst({
          where: eq(supportHandoffs.subject, subject),
          columns: {
            publicResponseAcknowledgedAt: true,
            publicResponseAcknowledgedVersion: true,
          },
        });

        return handoff?.publicResponseAcknowledgedAt
          ? handoff.publicResponseAcknowledgedVersion
          : null;
      },
      { timeout: 15000, intervals: [250, 500, 1000] }
    )
    .toBe(version);
}

export async function expectMemberReplyVersion(
  subject: string,
  reply: string,
  version: number
): Promise<void> {
  await expect
    .poll(
      async () => {
        const handoff = await db.query.supportHandoffs.findFirst({
          where: eq(supportHandoffs.subject, subject),
          columns: {
            memberReply: true,
            memberReplyAt: true,
            memberReplyResponseVersion: true,
          },
        });

        return handoff?.memberReply === reply && handoff.memberReplyAt
          ? handoff.memberReplyResponseVersion
          : null;
      },
      { timeout: 15000, intervals: [250, 500, 1000] }
    )
    .toBe(version);
}

export async function acknowledgeVisibleMemberPublicResponse(
  memberPage: Page,
  response: string
): Promise<void> {
  const responseBanner = memberPage
    .getByTestId('member-support-handoff-public-response')
    .filter({ hasText: response })
    .first();
  await expect(responseBanner).toBeVisible({ timeout: 15000 });
  await responseBanner.getByTestId('member-support-handoff-public-response-ack-submit').click();
  await expect(
    responseBanner.getByTestId('member-support-handoff-public-response-acknowledged')
  ).toBeVisible({ timeout: 15000 });
}

export async function submitVisibleMemberReply(memberPage: Page, reply: string): Promise<void> {
  const responseBanner = memberPage.getByTestId('member-support-handoff-public-response').first();
  await expect(responseBanner.getByTestId('member-reply-form')).toBeVisible({ timeout: 15000 });
  await responseBanner.getByTestId('member-reply-input').fill(reply);
  await responseBanner.getByTestId('member-reply-submit').click();
  await expect(responseBanner.getByTestId('member-reply-success')).toBeVisible({ timeout: 15000 });
  await expect(responseBanner.getByTestId('member-reply-form')).toHaveCount(0);
}
