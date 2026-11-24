import {
  E2E_USERS,
  and,
  auditLog,
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
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { changeClaimStatus } from '@interdomestik/domain-claims/claims/change-status';
import { mergeTests } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  CLOSED_SERVICES_PROJECT,
  expect,
  test as closedServicesTest,
} from '../../e2e-mac/closed-services.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { verifyOtherRolesCannotChangeStatus } from './member-staff-evidence-journey-access.fixture';
import {
  saveInterveningPublicNote,
  verifyStatusTransportRecovery,
} from './staff-status-transport.fixture';
import {
  cleanupJourney,
  expectJourneyClean,
} from './member-staff-evidence-journey-cleanup.fixture';
import { expectMemberClaimContinuity } from './member-staff-evidence-journey-member-view.fixture';
import {
  establishDraftTenantContext,
  idaBaseURL,
  openMemberContext,
  submitExactDraft,
} from './member-staff-evidence-journey.fixture';

import { teardown } from './s5-saved-draft.fixture';
import { signalTest } from './signal-wait.fixture';

const test = mergeTests(closedServicesTest, signalTest);

test.describe('S3 member-to-staff evidence journey bounded prefix', () => {
  let residue: {
    claimId: string | null;
    counterparty: string;
    memberSession: Awaited<ReturnType<typeof openMemberContext>> | null;
    summary: string;
  } | null = null;

  test.afterEach(async () => {
    const run = residue;
    if (!run) return;
    const cleanedIds = new Set<string>();
    const context = run.memberSession?.context;
    try {
      await teardown([
        ...(context ? [() => context.close()] : []),
        () => cleanupJourney(run.claimId, run, cleanedIds),
        () => expectJourneyClean(run.claimId, run, cleanedIds),
      ]);
    } finally {
      residue = null;
    }
  });

  test('persists submission, staff verification, and member-safe continuity', async ({
    browser,
    staffPage,
    waitForSignal,
  }, testInfo) => {
    // Only the serial KS runs may own S3 residue.
    test.skip(
      !['gate-ks-sq', CLOSED_SERVICES_PROJECT].includes(testInfo.project.name),
      'Other project'
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
    const newerNote = `S7 intervening public update ${randomUUID()}`;
    const privateNote = `S3 private staff note ${randomUUID()}`;
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

    const unauthorizedNotes = await verifyOtherRolesCannotChangeStatus(submitted.claimId);

    await gotoApp(staffPage, routes.staffClaimDetail(submitted.claimId, testInfo), testInfo, {
      marker: 'staff-claim-detail-ready',
    });
    const staffDetail = staffPage.getByTestId('staff-claim-detail-ready').first();
    await expect(staffDetail).toContainText(submitted.claimNumber);
    await staffDetail.locator('#claim-status-select').click();
    await staffPage.getByRole('option', { name: 'Verifikim', exact: true }).click();
    await staffDetail.getByLabel('Shënim statusi').fill(publicNote);
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
    await verifyStatusTransportRecovery(
      staffPage,
      submitted.claimId,
      publicNote,
      waitForSignal,
      async () => {
        const assignedClaim = await db.query.claims.findFirst({
          where: and(
            eq(claims.id, submitted.claimId),
            eq(claims.tenantId, E2E_USERS.KS_MEMBER.tenantId)
          ),
          columns: { assignedAt: true, staffId: true, updatedAt: true },
        });
        expect(assignedClaim?.staffId).toBe(staffActor.id);
        expect(assignedClaim?.assignedAt).toBeInstanceOf(Date);
        expect(assignedClaim?.assignedAt?.toISOString()).toBe(
          assignedClaim?.updatedAt?.toISOString()
        );
        await saveInterveningPublicNote(staffPage, newerNote);
        return newerNote;
      }
    );
    const staffAuthority = mintTestTenantAuthority(staffActor.tenantId, {
      userId: staffActor.id,
      role: staffActor.role,
    });
    const privateResult = await changeClaimStatus(
      staffAuthority,
      {
        claimId: submitted.claimId,
        toStatus: 'verification',
        note: privateNote,
        isPublicNote: false,
      },
      { hostId: staffActor.tenantId }
    );
    expect(privateResult).toMatchObject({ ok: true, changed: false });
    await expect
      .poll(async () => {
        const rows = await db.query.notifications.findMany({
          where: and(
            eq(notifications.tenantId, E2E_USERS.KS_MEMBER.tenantId),
            inArray(notifications.type, ['claim_submitted', 'claim_status_changed']),
            eq(notifications.actionUrl, `/member/claims/${submitted.claimId}`)
          ),
          columns: { content: true, title: true, type: true },
        });
        return {
          privateLeak: rows.some(row => `${row.title}${row.content}`.includes(privateNote)),
          types: rows.map(row => row.type).sort(),
        };
      })
      .toEqual({
        privateLeak: false,
        types: ['claim_status_changed', 'claim_submitted'],
      });

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
    expect(histories.filter(row => row.note === publicNote)).toHaveLength(1);
    expect(histories.filter(row => row.note === newerNote)).toHaveLength(1);
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
    // The staff UI (S1) made one real change; the two notes after it are same-status notes.
    // Exactly one event and one audit row record it: the after-commit projection adds none.
    expect(events.filter(event => event.eventName === 'claim.status_changed')).toHaveLength(1);
    const audits = await db.query.auditLog.findMany({
      where: and(
        eq(auditLog.entityId, submitted.claimId),
        eq(auditLog.tenantId, E2E_USERS.KS_MEMBER.tenantId)
      ),
      columns: { action: true },
    });
    expect(audits.filter(audit => audit.action === 'claim.status_changed')).toHaveLength(1);

    residue.memberSession = await openMemberContext(browser, memberBaseURL);
    await establishDraftTenantContext(residue.memberSession.page, memberBaseURL, locale);
    await gotoApp(residue.memberSession.page, submitted.claimHref, testInfo, {
      baseURL: memberBaseURL,
      marker: 'member-claim-progress-summary',
    });
    await expectMemberClaimContinuity(residue.memberSession.page, publicNote, privateNote);

    testInfo.annotations.push({
      type: 'isolated-task-db-cleanup',
      description: `S3 canonical claim ${submitted.claimNumber}; afterEach removes exact rows and the isolated task database is dropped after verification.`,
    });
  });
});
