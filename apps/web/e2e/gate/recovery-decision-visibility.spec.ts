import { claimEscalationAgreements, db, eq } from '@interdomestik/database';
import { and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/auth.fixture';
import mkClaims from '../../src/messages/mk/claims.json';
import sqClaims from '../../src/messages/sq/claims.json';
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
    const decisionId = existingDecision?.id ?? `e2e-s08-${randomUUID()}`;
    const now = new Date();
    const memberCopy = (testInfo.project.name.includes('mk') ? mkClaims : sqClaims).claims.detail
      .recoveryDecision;

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
        id: decisionId,
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

      const memberDecisionCard = memberPage.locator(
        '[data-testid="member-claim-recovery-decision"]:visible'
      );

      await expect(memberDecisionCard).toBeVisible();
      await expect(memberDecisionCard.getByText(memberCopy.acceptedTitle)).toBeVisible();
      await expect(memberDecisionCard.getByText(memberCopy.acceptedDescription)).toBeVisible();
      await expect(memberPage.getByText(internalExplanation)).toHaveCount(0);

      await gotoApp(staffPage, routes.staffClaimDetail(claimId, testInfo), testInfo, {
        marker: 'staff-recovery-decision-summary',
      });

      const staffDecisionSummary = staffPage.locator(
        '[data-testid="staff-recovery-decision-summary"]:visible'
      );

      await expect(staffDecisionSummary).toBeVisible();
      await expect(staffDecisionSummary.getByText(internalExplanation)).toBeVisible();

      await db
        .update(claimEscalationAgreements)
        .set({
          decisionType: 'declined',
          declineReasonCode: 'conflict_or_integrity_concern',
          decisionReason: internalExplanation,
          updatedAt: new Date(),
        })
        .where(eq(claimEscalationAgreements.id, decisionId));

      await memberPage.reload();
      await expect(memberDecisionCard.getByText(memberCopy.declinedTitle)).toBeVisible();
      await expect(memberDecisionCard.getByText(memberCopy.reasons.other.title)).toBeVisible();
      await expect(
        memberDecisionCard.getByRole('link', { name: memberCopy.supportCta })
      ).toBeVisible();
      await expect(memberPage.getByText(internalExplanation)).toHaveCount(0);
      await expect(memberPage.getByText(/conflict of interest|integrity concern/i)).toHaveCount(0);

      await staffPage.reload();
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
