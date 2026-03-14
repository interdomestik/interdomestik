import { claimEscalationAgreements, db, eq } from '@interdomestik/database';
import { and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { resolveSeededClaimContext } from '../utils/seeded-claim-context';
import { gotoApp } from '../utils/navigation';

test.describe('Recovery decision visibility', () => {
  test('member sees only the safe accepted recovery state while staff retain the internal explanation', async ({
    authenticatedPage: memberPage,
    staffPage,
  }, testInfo) => {
    const {
      claimId,
      existingAgreement: existingDecision,
      staffId,
      tenantId,
    } = await resolveSeededClaimContext(testInfo);
    const internalExplanation = `S08 internal decision ${Date.now()}`;
    const now = new Date();

    if (existingDecision?.id) {
      await db
        .update(claimEscalationAgreements)
        .set({
          acceptedAt: now,
          acceptedById: staffId,
          decisionType: 'accepted',
          declineReasonCode: null,
          decisionReason: internalExplanation,
          updatedAt: now,
        })
        .where(eq(claimEscalationAgreements.id, existingDecision.id));
    } else {
      await db.insert(claimEscalationAgreements).values({
        id: `e2e-s08-${randomUUID()}`,
        tenantId,
        claimId,
        acceptedById: staffId,
        acceptedAt: now,
        decisionType: 'accepted',
        declineReasonCode: null,
        decisionReason: internalExplanation,
        createdAt: now,
        updatedAt: now,
      });
    }

    try {
      await gotoApp(memberPage, routes.memberClaimDetail(claimId, testInfo), testInfo, {
        marker: 'member-claim-recovery-decision',
      });

      await expect(memberPage.getByTestId('member-claim-recovery-decision')).toBeVisible();
      await expect(memberPage.getByText('Accepted for staff-led recovery')).toBeVisible();
      await expect(
        memberPage.getByText('We accepted this matter for staff-led recovery.')
      ).toBeVisible();
      await expect(memberPage.getByText(internalExplanation)).toHaveCount(0);

      await gotoApp(staffPage, routes.staffClaimDetail(claimId, testInfo), testInfo, {
        marker: 'staff-recovery-decision-summary',
      });

      const staffDecisionSummary = staffPage.getByTestId('staff-recovery-decision-summary');

      await expect(staffDecisionSummary).toBeVisible();
      await expect(staffDecisionSummary.getByText('Accepted for staff-led recovery')).toBeVisible();
      await expect(staffDecisionSummary.getByText(internalExplanation)).toBeVisible();
    } finally {
      if (existingDecision?.id) {
        await db
          .update(claimEscalationAgreements)
          .set({
            acceptedAt: existingDecision.acceptedAt,
            acceptedById: existingDecision.acceptedById,
            decisionType: existingDecision.decisionType,
            declineReasonCode: existingDecision.declineReasonCode,
            decisionReason: existingDecision.decisionReason,
            updatedAt: existingDecision.updatedAt ?? now,
          })
          .where(eq(claimEscalationAgreements.id, existingDecision.id));
      } else {
        await db
          .delete(claimEscalationAgreements)
          .where(
            and(
              eq(claimEscalationAgreements.tenantId, tenantId),
              eq(claimEscalationAgreements.claimId, claimId)
            )
          );
      }
    }
  });
});
