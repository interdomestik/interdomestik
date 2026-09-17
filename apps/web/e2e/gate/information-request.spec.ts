import { and, claimInformationRequests, claims, db, eq } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';
import { routes } from '../routes';
import {
  establishDraftTenantContext,
  idaBaseURL,
  openMemberContext,
} from './member-staff-evidence-journey.fixture';
import { withInformationRequestFixture } from './information-request.fixture';

test('S4 staff request persists and is visible in a fresh member session', async ({
  staffPage,
  browser,
}, testInfo) => {
  // This fixture owns KS tenant identities; other locale projects must not reuse its records.
  test.skip(testInfo.project.name !== 'gate-ks-sq', 'S4 owns its isolated KS verification fixture');
  test.setTimeout(120_000);
  await withInformationRequestFixture(async fixture => {
    const before = await db.query.claims.findFirst({ where: eq(claims.id, fixture.claimId) });
    await gotoApp(staffPage, routes.staffClaimDetail(fixture.claimId, testInfo), testInfo, {
      marker: 'staff-claim-detail-ready',
    });
    const form = staffPage.getByTestId('staff-information-request-form').filter({ visible: true });
    await expect(form).toHaveCount(1);
    await expect(form).toBeVisible();
    await form.locator('[name="requestedInformation"]').fill('S4 repair estimate');
    await form
      .locator('[name="explanationForMember"]')
      .fill('S4 member-visible assessment explanation');
    await form.locator('[name="dueAt"]').fill('2030-01-02T10:00');
    await form.getByRole('button', { name: 'Dërgo kërkesën', exact: true }).click();
    await expect(form.getByRole('status')).toHaveText('Kërkesa për informacion u ruajt.');
    const rows = await db
      .select()
      .from(claimInformationRequests)
      .where(
        and(
          eq(claimInformationRequests.tenantId, fixture.tenantId),
          eq(claimInformationRequests.claimId, fixture.claimId)
        )
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      responsibleStaffId: fixture.staffId,
      createdByStaffId: fixture.staffId,
      slaPosture: 'incomplete',
      status: 'open',
    });
    expect(await db.query.claims.findFirst({ where: eq(claims.id, fixture.claimId) })).toEqual(
      before
    );
    const baseURL = idaBaseURL(testInfo);
    const member = await openMemberContext(browser, baseURL);
    try {
      await establishDraftTenantContext(member.page, baseURL, routes.getLocale(testInfo));
      await gotoApp(member.page, routes.memberClaimDetail(fixture.claimId, testInfo), testInfo, {
        baseURL,
        marker: 'member-claim-progress-summary',
      });
      const card = member.page.getByTestId('claim-information-request').filter({ visible: true });
      await expect(card).toHaveCount(1);
      await expect(card).toContainText('S4 repair estimate');
      await expect(card).toContainText('S4 member-visible assessment explanation');
      await expect(card).toContainText(rows[0].id);
      await expect(card.locator('time')).toHaveAttribute('datetime', rows[0].dueAt.toISOString());
      await expect(card.locator('time')).toContainText(
        `${rows[0].dueAt.toISOString().slice(11, 16)} UTC`
      );
      await expect(member.page.locator('body')).not.toContainText(fixture.privateNote);
      const html = await member.page.content();
      expect(html).not.toContain(rows[0].correlationId);
      expect(html).not.toContain(fixture.staffId);
      await expect(card.getByRole('button')).toHaveCount(0);
      await expect(member.page.getByTestId('staff-information-request-form')).toHaveCount(0);
    } finally {
      await member.context.close();
    }
  });
});
