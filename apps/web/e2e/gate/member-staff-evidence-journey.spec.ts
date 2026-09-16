import {
  E2E_PASSWORD,
  E2E_USERS,
  and,
  claimStageHistory,
  claims,
  db,
  domainEvents,
  eq,
  user,
} from '@interdomestik/database';
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';
import { updateClaimStatusCore } from '@interdomestik/domain-claims/staff-claims/update-status';
import { randomUUID } from 'node:crypto';
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

const facts = {
  category: 'vehicle',
  date: '2026-09-16',
  issue: 'collision',
  outcome: 'repair',
} as const;

const visibleIntake = (page: Page) =>
  page.locator('[data-testid="claim-draft-intake"]:visible').first();

async function submitExactDraft(memberPage: Page, testInfo: TestInfo) {
  const journeyId = randomUUID();
  const counterparty = `S3 operator ${journeyId}`;
  const summary = `S3 member-to-staff journey ${journeyId}`;
  await gotoApp(memberPage, routes.memberNewClaim(testInfo), testInfo, {
    marker: 'new-claim-page-ready',
  });

  const intake = visibleIntake(memberPage);
  const panel = intake.getByTestId('claim-draft-main-panel');
  await intake.getByTestId(`claim-draft-category-${facts.category}`).click();
  await intake.getByTestId('claim-draft-category-continue').click();
  await panel.locator('select').nth(0).selectOption(facts.issue);
  await panel.locator('input[type="date"]').fill(facts.date);
  await panel.locator('input[type="text"]').fill(counterparty);
  await panel.locator('select').nth(1).selectOption(facts.outcome);
  await panel.locator('textarea').fill(summary);
  await panel.locator('button').last().click();
  await expect(intake.getByTestId('claim-draft-dormant-preview')).toBeVisible();

  await intake.getByTestId('free-start-save-open').click();
  await expect(intake.getByTestId('free-start-save-status')).toHaveAttribute('data-state', 'saved');
  await intake.getByTestId('free-start-manage-open').click();
  const exactDraft = memberPage.locator('[data-testid^="free-start-draft-"]').filter({
    hasText: summary,
  });
  await expect(exactDraft).toHaveCount(1);
  await exactDraft.locator('[data-testid^="free-start-resume-"]').click();

  const submit = intake.getByTestId('claim-draft-submit');
  await expect(submit).toBeEnabled();
  await submit.click();
  const success = memberPage.getByTestId('claim-created-success');
  await expect(success).toBeVisible({ timeout: 15_000 });
  const claimNumber = await success.getAttribute('data-claim-number');
  expect(claimNumber).toMatch(/^CLM-[A-Z0-9]{2,10}-\d{4}-\d{6}$/);
  const claimHref = await success.locator('a').getAttribute('href');
  expect(claimHref).toMatch(/^\/sq\/member\/claims\/fsd_[a-f0-9]{64}$/);
  const claimId = decodeURIComponent(claimHref!.split('/').at(-1)!);
  return { claimId, claimNumber: claimNumber!, claimHref: claimHref!, summary };
}

async function establishDraftTenantContext(memberPage: Page, testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL;
  if (!baseURL) throw new Error('Gate project baseURL missing');
  const origin = new URL(baseURL).origin;
  const response = await memberPage.request.post(`${origin}/api/auth/sign-in/email`, {
    data: {
      email: E2E_USERS.KS_MEMBER.email,
      password: E2E_PASSWORD,
      additionalData: { tenantId: E2E_USERS.KS_MEMBER.tenantId },
    },
    headers: {
      Origin: origin,
      Referer: `${origin}${routes.login(testInfo)}`,
      'x-tenant-id': E2E_USERS.KS_MEMBER.tenantId,
    },
  });
  expect(response.ok()).toBe(true);
}

function idaTestInfo(testInfo: TestInfo): TestInfo {
  const configured = process.env.IDA_HOST?.trim() || 'ida.127.0.0.1.nip.io:3000';
  const authority = new URL(configured.includes('://') ? configured : `http://${configured}`).host;
  const baseURL = `http://${authority}/${routes.getLocale(testInfo)}`;
  return {
    ...testInfo,
    project: { ...testInfo.project, use: { ...testInfo.project.use, baseURL } },
  } as TestInfo;
}

test.describe('S3 member-to-staff evidence journey bounded prefix', () => {
  test('persists submission, staff verification, and member-safe continuity', async ({
    browser,
    staffPage,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'gate-ks-sq',
      'One exact isolated-DB project owns S3 residue'
    );
    test.setTimeout(120_000);
    const memberTestInfo = idaTestInfo(testInfo);
    const baseURL = memberTestInfo.project.use.baseURL;
    if (!baseURL) throw new Error('Gate project baseURL missing');
    const origin = new URL(baseURL);
    const memberContext = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { 'x-tenant-id': E2E_USERS.KS_MEMBER.tenantId },
      storageState: {
        cookies: [
          {
            domain: origin.hostname,
            expires: -1,
            httpOnly: false,
            name: 'cookie_consent',
            path: '/',
            sameSite: 'Lax',
            secure: origin.protocol === 'https:',
            value: 'necessary',
          },
        ],
        origins: [],
      },
    });
    const memberPage = await memberContext.newPage();
    try {
      const publicNote = `S3 public verification ${randomUUID()}`;
      const privateNote = `S3 private staff note ${randomUUID()}`;
      await establishDraftTenantContext(memberPage, memberTestInfo);
      const submitted = await submitExactDraft(memberPage, memberTestInfo);

      await expect
        .poll(async () => {
          const row = await db.query.claims.findFirst({
            where: and(
              eq(claims.id, submitted.claimId),
              eq(claims.tenantId, E2E_USERS.KS_MEMBER.tenantId)
            ),
            columns: {
              caseLifecycleState: true,
              recoveryLifecycleState: true,
            },
          });
          return row ? claimStatusFromLifecycleFields(row) : null;
        })
        .toBe('submitted');

      await gotoApp(staffPage, routes.staffClaimDetail(submitted.claimId, testInfo), testInfo, {
        marker: 'staff-claim-detail-ready',
      });
      const staffDetail = staffPage.getByTestId('staff-claim-detail-ready').first();
      await expect(staffDetail).toContainText(submitted.claimNumber);
      await staffDetail.locator('#claim-status-select').click();
      await staffPage.getByRole('option', { name: 'Verifikim', exact: true }).click();
      await staffDetail.getByLabel('Shënim statusi').fill(publicNote);
      await staffDetail.getByTestId('staff-update-claim-button').click();
      await expect(staffPage.getByText('Statusi i rastit u përditësua')).toBeVisible();
      await expect(staffDetail.getByTestId('staff-claim-detail-note')).toContainText(publicNote);

      const staffActor = await db.query.user.findFirst({
        where: and(
          eq(user.email, E2E_USERS.KS_STAFF.email),
          eq(user.tenantId, E2E_USERS.KS_STAFF.tenantId)
        ),
        columns: { branchId: true, id: true, role: true, tenantId: true },
      });
      if (!staffActor?.id || !staffActor.tenantId) throw new Error('Seeded KS staff actor missing');
      const privateResult = await updateClaimStatusCore({
        claimId: submitted.claimId,
        newStatus: 'verification',
        note: privateNote,
        isPublicChange: false,
        session: { user: staffActor },
        requestHeaders: new Headers({ 'x-forwarded-host': 'ida.127.0.0.1.nip.io:3000' }),
      });
      expect(privateResult.success).toBe(true);

      const persistedClaim = await db.query.claims.findFirst({
        where: and(
          eq(claims.id, submitted.claimId),
          eq(claims.tenantId, E2E_USERS.KS_MEMBER.tenantId)
        ),
        columns: {
          caseLifecycleState: true,
          claimNumber: true,
          recoveryLifecycleState: true,
          staffId: true,
        },
      });
      expect(persistedClaim?.claimNumber).toBe(submitted.claimNumber);
      expect(persistedClaim ? claimStatusFromLifecycleFields(persistedClaim) : null).toBe(
        'verification'
      );
      expect(persistedClaim?.staffId).toBe(staffActor.id);

      const histories = await db.query.claimStageHistory.findMany({
        where: and(
          eq(claimStageHistory.claimId, submitted.claimId),
          eq(claimStageHistory.tenantId, E2E_USERS.KS_MEMBER.tenantId)
        ),
        columns: { fromStatus: true, isPublic: true, note: true, toStatus: true },
      });
      expect(histories).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ fromStatus: null, isPublic: true, toStatus: 'submitted' }),
          expect.objectContaining({
            fromStatus: 'submitted',
            isPublic: true,
            note: publicNote,
            toStatus: 'verification',
          }),
          expect.objectContaining({
            fromStatus: 'verification',
            isPublic: false,
            note: privateNote,
            toStatus: 'verification',
          }),
        ])
      );

      const events = await db.query.domainEvents.findMany({
        where: and(
          eq(domainEvents.entityId, submitted.claimId),
          eq(domainEvents.tenantId, E2E_USERS.KS_MEMBER.tenantId)
        ),
        columns: { eventName: true },
      });
      expect(events.map(event => event.eventName)).toEqual(
        expect.arrayContaining(['case.created', 'claim.status_changed'])
      );

      await gotoApp(memberPage, submitted.claimHref, memberTestInfo, {
        marker: 'member-claim-progress-summary',
      });
      await expect(memberPage.getByTestId('member-claim-current-state').first()).toHaveText(
        'Verifikim'
      );
      await expect(memberPage.getByTestId('member-claim-latest-update-note').first()).toHaveText(
        publicNote
      );
      await expect(
        memberPage.getByTestId('ops-timeline-item').filter({ hasText: publicNote }).first()
      ).toBeVisible();
      await expect(memberPage.getByText(privateNote)).toHaveCount(0);
      await expect(memberPage.getByTestId('member-claim-sla-status-phase').first()).toBeVisible();

      testInfo.annotations.push({
        type: 'isolated-task-db-residue',
        description: `S3 canonical claim ${submitted.claimNumber}; task database is dropped after verification.`,
      });
    } finally {
      await memberContext.close();
    }
  });
});
