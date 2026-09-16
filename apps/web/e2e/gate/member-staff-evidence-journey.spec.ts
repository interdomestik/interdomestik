import {
  E2E_USERS,
  and,
  claimStageHistory,
  claims,
  db,
  domainEvents,
  eq,
  inArray,
  notifications,
  user,
} from '@interdomestik/database';
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';
import { updateClaimStatusCore } from '@interdomestik/domain-claims/staff-claims/update-status';
import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import {
  cleanupJourney,
  expectJourneyClean,
} from './member-staff-evidence-journey-cleanup.fixture';
import {
  establishDraftTenantContext,
  idaBaseURL,
  openMemberContext,
  submitExactDraft,
} from './member-staff-evidence-journey.fixture';

test.describe('S3 member-to-staff evidence journey bounded prefix', () => {
  let residue: {
    claimId: string | null;
    counterparty: string;
    memberSession: Awaited<ReturnType<typeof openMemberContext>> | null;
    summary: string;
  } | null = null;

  test.afterEach(async () => {
    if (!residue) return;
    await residue.memberSession?.context.close();
    await cleanupJourney(residue.claimId, residue);
    await expectJourneyClean(residue.claimId, residue);
    residue = null;
  });

  test('persists submission, staff verification, and member-safe continuity', async ({
    browser,
    staffPage,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'gate-ks-sq',
      'One exact isolated-DB project owns S3 residue'
    );
    expect(testInfo.config.workers).toBe(1);
    expect(testInfo.parallelIndex).toBe(0);
    test.setTimeout(120_000);
    const memberBaseURL = idaBaseURL(testInfo);
    const locale = routes.getLocale(testInfo);
    const journeyId = randomUUID();
    const journey = {
      counterparty: `S3 operator ${journeyId}`,
      summary: `S3 member-to-staff journey ${journeyId}`,
    };
    residue = { claimId: null, memberSession: null, ...journey };
    residue.memberSession = await openMemberContext(browser, memberBaseURL);
    const publicNote = `S3 public verification ${randomUUID()}`;
    const privateNote = `S3 private staff note ${randomUUID()}`;
    const unauthorizedNotes: string[] = [];
    await establishDraftTenantContext(residue.memberSession.page, memberBaseURL, locale);
    const submitted = await submitExactDraft(
      residue.memberSession.page,
      testInfo,
      memberBaseURL,
      journey,
      claimId => {
        residue!.claimId = claimId;
      }
    );
    await residue.memberSession.context.close();
    residue.memberSession = null;

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
    await expect
      .poll(async () => {
        const rows = await db.query.notifications.findMany({
          where: and(
            eq(notifications.tenantId, E2E_USERS.KS_MEMBER.tenantId),
            inArray(notifications.type, ['claim_submitted', 'claim_status_changed']),
            eq(notifications.actionUrl, `/member/claims/${submitted.claimId}`)
          ),
          columns: { type: true },
        });
        return [...new Set(rows.map(row => row.type))].sort();
      })
      .toEqual(['claim_status_changed', 'claim_submitted']);

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
    const assignedClaim = await db.query.claims.findFirst({
      where: and(
        eq(claims.id, submitted.claimId),
        eq(claims.tenantId, E2E_USERS.KS_MEMBER.tenantId)
      ),
      columns: { assignedAt: true, staffId: true, updatedAt: true },
    });
    expect(assignedClaim?.staffId).toBe(staffActor.id);
    expect(assignedClaim?.assignedAt?.toISOString()).toBe(assignedClaim?.updatedAt?.toISOString());
    const privateResult = await updateClaimStatusCore({
      claimId: submitted.claimId,
      newStatus: 'verification',
      note: privateNote,
      isPublicChange: false,
      session: { user: staffActor },
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

    residue.memberSession = await openMemberContext(browser, memberBaseURL);
    await establishDraftTenantContext(residue.memberSession.page, memberBaseURL, locale);
    await gotoApp(residue.memberSession.page, submitted.claimHref, testInfo, {
      baseURL: memberBaseURL,
      marker: 'member-claim-progress-summary',
    });
    const memberPage = residue.memberSession.page;
    await expect(memberPage.getByTestId('member-claim-current-state').first()).toHaveText(
      'Verifikim'
    );
    await expect(memberPage.getByTestId('member-claim-latest-update-note').first()).toHaveText(
      publicNote
    );
    await expect(
      memberPage.getByTestId('ops-timeline-item').filter({ hasText: publicNote }).first()
    ).toBeVisible();
    await expect(memberPage.locator('body')).not.toContainText(privateNote);
    await expect(memberPage.getByTestId('member-claim-sla-status-phase').first()).toBeVisible();

    testInfo.annotations.push({
      type: 'isolated-task-db-cleanup',
      description: `S3 canonical claim ${submitted.claimNumber}; afterEach removes exact rows and the isolated task database is dropped after verification.`,
    });
  });
});
