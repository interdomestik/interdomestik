import {
  E2E_PASSWORD,
  E2E_USERS,
  and,
  auditLog,
  claimStageHistory,
  claims,
  db,
  domainEventDeliveries,
  domainEvents,
  eq,
  freeStartDrafts,
  inArray,
  notifications,
  user,
} from '@interdomestik/database';
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';
import { updateClaimStatusCore } from '@interdomestik/domain-claims/staff-claims/update-status';
import { randomUUID } from 'node:crypto';
import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
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

async function submitExactDraft(
  memberPage: Page,
  testInfo: TestInfo,
  journey: { counterparty: string; summary: string }
) {
  await gotoApp(memberPage, routes.memberNewClaim(testInfo), testInfo, {
    marker: 'new-claim-page-ready',
  });

  const intake = visibleIntake(memberPage);
  const panel = intake.getByTestId('claim-draft-main-panel');
  await intake.getByTestId(`claim-draft-category-${facts.category}`).click();
  await intake.getByTestId('claim-draft-category-continue').click();
  await panel.locator(`select:has(option[value="${facts.issue}"])`).selectOption(facts.issue);
  await panel.getByLabel('Kur ndodhi?').fill(facts.date);
  await panel.getByLabel('Me kë po merresh?').fill(journey.counterparty);
  await panel.locator(`select:has(option[value="${facts.outcome}"])`).selectOption(facts.outcome);
  await panel.getByLabel('Përmbledhje e shkurtër').fill(journey.summary);
  await panel.getByRole('button', { name: 'Shikoni përmbledhjen', exact: true }).click();
  await expect(intake.getByTestId('claim-draft-dormant-preview')).toBeVisible();

  await intake.getByTestId('free-start-save-open').click();
  await expect(intake.getByTestId('free-start-save-status')).toHaveAttribute('data-state', 'saved');
  await intake.getByTestId('free-start-manage-open').click();
  const exactDraft = memberPage.locator('[data-testid^="free-start-draft-"]').filter({
    hasText: journey.summary,
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
  return { claimId, claimNumber: claimNumber!, claimHref: claimHref! };
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
  const projectBaseURL = testInfo.project.use.baseURL;
  if (!projectBaseURL) throw new Error('Gate project baseURL missing');
  const projectPort = new URL(projectBaseURL).port;
  const configured =
    process.env.IDA_HOST?.trim() || `ida.127.0.0.1.nip.io${projectPort ? `:${projectPort}` : ''}`;
  const authority = new URL(configured.includes('://') ? configured : `http://${configured}`).host;
  const baseURL = `http://${authority}/${routes.getLocale(testInfo)}`;
  return {
    ...testInfo,
    project: { ...testInfo.project, use: { ...testInfo.project.use, baseURL } },
  } as TestInfo;
}

async function openMemberContext(
  browser: Browser,
  testInfo: TestInfo
): Promise<{ context: BrowserContext; page: Page }> {
  const baseURL = testInfo.project.use.baseURL;
  if (!baseURL) throw new Error('Gate project baseURL missing');
  const origin = new URL(baseURL);
  const context = await browser.newContext({
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
  return { context, page: await context.newPage() };
}

async function cleanupJourney(claimId: string | null, summary: string): Promise<void> {
  if (claimId) {
    const events = await db.query.domainEvents.findMany({
      where: and(
        eq(domainEvents.entityId, claimId),
        eq(domainEvents.tenantId, E2E_USERS.KS_MEMBER.tenantId)
      ),
      columns: { id: true },
    });
    const eventIds = events.map(event => event.id);
    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.tenantId, E2E_USERS.KS_MEMBER.tenantId),
          eq(notifications.actionUrl, `/dashboard/claims/${claimId}`)
        )
      );
    await db
      .delete(auditLog)
      .where(
        and(eq(auditLog.tenantId, E2E_USERS.KS_MEMBER.tenantId), eq(auditLog.entityId, claimId))
      );
    if (eventIds.length) {
      await db
        .delete(domainEventDeliveries)
        .where(inArray(domainEventDeliveries.eventId, eventIds));
      await db.delete(domainEvents).where(inArray(domainEvents.id, eventIds));
    }
    await db.delete(claimStageHistory).where(eq(claimStageHistory.claimId, claimId));
    await db.delete(claims).where(eq(claims.id, claimId));
  }
  await db
    .delete(freeStartDrafts)
    .where(
      and(
        eq(freeStartDrafts.tenantId, E2E_USERS.KS_MEMBER.tenantId),
        eq(freeStartDrafts.summary, summary)
      )
    );
}

async function expectJourneyClean(claimId: string | null, summary: string): Promise<void> {
  const [claimRows, draftRows, eventRows, historyRows, notificationRows, auditRows] =
    await Promise.all([
      claimId
        ? db.query.claims.findMany({ where: eq(claims.id, claimId), columns: { id: true } })
        : [],
      db.query.freeStartDrafts.findMany({
        where: and(
          eq(freeStartDrafts.tenantId, E2E_USERS.KS_MEMBER.tenantId),
          eq(freeStartDrafts.summary, summary)
        ),
        columns: { id: true },
      }),
      claimId
        ? db.query.domainEvents.findMany({
            where: and(
              eq(domainEvents.entityId, claimId),
              eq(domainEvents.tenantId, E2E_USERS.KS_MEMBER.tenantId)
            ),
            columns: { id: true },
          })
        : [],
      claimId
        ? db.query.claimStageHistory.findMany({
            where: eq(claimStageHistory.claimId, claimId),
            columns: { id: true },
          })
        : [],
      claimId
        ? db.query.notifications.findMany({
            where: and(
              eq(notifications.tenantId, E2E_USERS.KS_MEMBER.tenantId),
              eq(notifications.actionUrl, `/dashboard/claims/${claimId}`)
            ),
            columns: { id: true },
          })
        : [],
      claimId
        ? db.query.auditLog.findMany({
            where: and(
              eq(auditLog.tenantId, E2E_USERS.KS_MEMBER.tenantId),
              eq(auditLog.entityId, claimId)
            ),
            columns: { id: true },
          })
        : [],
    ]);
  expect({ auditRows, claimRows, draftRows, eventRows, historyRows, notificationRows }).toEqual({
    auditRows: [],
    claimRows: [],
    draftRows: [],
    eventRows: [],
    historyRows: [],
    notificationRows: [],
  });
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
    const idaAuthority = new URL(memberTestInfo.project.use.baseURL!).host;
    const journeyId = randomUUID();
    const journey = {
      counterparty: `S3 operator ${journeyId}`,
      summary: `S3 member-to-staff journey ${journeyId}`,
    };
    let claimId: string | null = null;
    let memberSession: Awaited<ReturnType<typeof openMemberContext>> | null =
      await openMemberContext(browser, memberTestInfo);
    try {
      const publicNote = `S3 public verification ${randomUUID()}`;
      const privateNote = `S3 private staff note ${randomUUID()}`;
      const unauthorizedNotes: string[] = [];
      await establishDraftTenantContext(memberSession.page, memberTestInfo);
      const submitted = await submitExactDraft(memberSession.page, memberTestInfo, journey);
      claimId = submitted.claimId;
      await memberSession.context.close();
      memberSession = null;

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

      for (const seeded of [E2E_USERS.KS_MEMBER, E2E_USERS.KS_AGENT, E2E_USERS.KS_BRANCH_MANAGER]) {
        const actor = await db.query.user.findFirst({
          where: and(eq(user.email, seeded.email), eq(user.tenantId, E2E_USERS.KS_MEMBER.tenantId)),
          columns: { branchId: true, id: true, role: true, tenantId: true },
        });
        expect(actor).toMatchObject({
          branchId: seeded.branchId,
          role: seeded.dbRole,
          tenantId: seeded.tenantId,
        });
        if (!actor) throw new Error(`Seeded ${seeded.dbRole} actor missing`);
        const probeNote = `S3 unauthorized ${seeded.dbRole} ${randomUUID()}`;
        unauthorizedNotes.push(probeNote);
        const result = await updateClaimStatusCore({
          claimId: submitted.claimId,
          newStatus: 'verification',
          note: probeNote,
          isPublicChange: false,
          session: { user: actor },
          requestHeaders: new Headers({ 'x-forwarded-host': idaAuthority }),
        });
        expect(result).toEqual({ success: false, error: 'Unauthorized' });
      }

      const stillSubmitted = await db.query.claims.findFirst({
        where: and(
          eq(claims.id, submitted.claimId),
          eq(claims.tenantId, E2E_USERS.KS_MEMBER.tenantId)
        ),
        columns: { caseLifecycleState: true, recoveryLifecycleState: true },
      });
      expect(stillSubmitted ? claimStatusFromLifecycleFields(stillSubmitted) : null).toBe(
        'submitted'
      );

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
      expect(staffActor).toMatchObject({
        branchId: E2E_USERS.KS_STAFF.branchId,
        role: E2E_USERS.KS_STAFF.dbRole,
        tenantId: E2E_USERS.KS_STAFF.tenantId,
      });
      const privateResult = await updateClaimStatusCore({
        claimId: submitted.claimId,
        newStatus: 'verification',
        note: privateNote,
        isPublicChange: false,
        session: { user: staffActor },
        requestHeaders: new Headers({ 'x-forwarded-host': idaAuthority }),
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
      for (const unauthorizedNote of unauthorizedNotes) {
        expect(histories).not.toEqual(
          expect.arrayContaining([expect.objectContaining({ note: unauthorizedNote })])
        );
      }

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

      memberSession = await openMemberContext(browser, memberTestInfo);
      await establishDraftTenantContext(memberSession.page, memberTestInfo);
      await gotoApp(memberSession.page, submitted.claimHref, memberTestInfo, {
        marker: 'member-claim-progress-summary',
      });
      await expect(memberSession.page.getByTestId('member-claim-current-state').first()).toHaveText(
        'Verifikim'
      );
      await expect(
        memberSession.page.getByTestId('member-claim-latest-update-note').first()
      ).toHaveText(publicNote);
      await expect(
        memberSession.page.getByTestId('ops-timeline-item').filter({ hasText: publicNote }).first()
      ).toBeVisible();
      await expect(memberSession.page.locator('body')).not.toContainText(privateNote);
      await expect(
        memberSession.page.getByTestId('member-claim-sla-status-phase').first()
      ).toBeVisible();

      testInfo.annotations.push({
        type: 'isolated-task-db-cleanup',
        description: `S3 canonical claim ${submitted.claimNumber}; exact rows are removed in finally and the isolated task database is dropped after verification.`,
      });
    } finally {
      await memberSession?.context.close();
      await cleanupJourney(claimId, journey.summary);
      await expectJourneyClean(claimId, journey.summary);
    }
  });
});
