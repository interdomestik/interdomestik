import { claimEscalationAgreements, db, eq } from '@interdomestik/database';
import { and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { resolveSeededClaimContext } from '../utils/seeded-claim-context';
import { gotoApp } from '../utils/navigation';

test.describe('Accepted recovery prerequisites', () => {
  test('staff see accepted cases with a missing collection path as blocked on the canonical detail page', async ({
    staffPage,
  }, testInfo) => {
    const { claimId, existingAgreement, memberId, staffId, tenantId } =
      await resolveSeededClaimContext(testInfo);
    const now = new Date();

    if (existingAgreement?.id) {
      await db
        .update(claimEscalationAgreements)
        .set({
          acceptedAt: now,
          acceptedById: staffId,
          decisionType: 'accepted',
          declineReasonCode: null,
          decisionNextStatus: 'negotiation',
          decisionReason: 'Accepted for staff-led recovery with signed commercial terms.',
          signedByUserId: memberId,
          feePercentage: 15,
          minimumFee: '25.00',
          legalActionCapPercentage: 25,
          paymentAuthorizationState: 'authorized',
          successFeeRecoveredAmount: null,
          successFeeCurrencyCode: null,
          successFeeAmount: null,
          successFeeCollectionMethod: null,
          successFeeDeductionAllowed: null,
          successFeeHasStoredPaymentMethod: null,
          successFeeInvoiceDueAt: null,
          successFeeResolvedAt: null,
          successFeeResolvedById: null,
          successFeeSubscriptionId: null,
          termsVersion: '2026-03-v1',
          signedAt: now,
          updatedAt: now,
        })
        .where(eq(claimEscalationAgreements.id, existingAgreement.id));
    } else {
      await db.insert(claimEscalationAgreements).values({
        id: `e2e-s09-${randomUUID()}`,
        tenantId,
        claimId,
        acceptedById: staffId,
        acceptedAt: now,
        decisionType: 'accepted',
        declineReasonCode: null,
        decisionNextStatus: 'negotiation',
        decisionReason: 'Accepted for staff-led recovery with signed commercial terms.',
        signedByUserId: memberId,
        feePercentage: 15,
        minimumFee: '25.00',
        legalActionCapPercentage: 25,
        paymentAuthorizationState: 'authorized',
        successFeeRecoveredAmount: null,
        successFeeCurrencyCode: null,
        successFeeAmount: null,
        successFeeCollectionMethod: null,
        successFeeDeductionAllowed: null,
        successFeeHasStoredPaymentMethod: null,
        successFeeInvoiceDueAt: null,
        successFeeResolvedAt: null,
        successFeeResolvedById: null,
        successFeeSubscriptionId: null,
        termsVersion: '2026-03-v1',
        signedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    try {
      await gotoApp(staffPage, routes.staffClaimDetail(claimId, testInfo), testInfo, {
        marker: 'staff-accepted-recovery-prerequisites',
      });

      const prerequisiteSummary = staffPage.getByTestId('staff-accepted-recovery-prerequisites');
      const collectionSummary = staffPage.getByTestId('staff-success-fee-collection-summary');

      await expect(prerequisiteSummary).toBeVisible();
      await expect(prerequisiteSummary.getByText('Accepted recovery prerequisites')).toBeVisible();
      await expect(prerequisiteSummary.getByText('Agreement')).toBeVisible();
      await expect(prerequisiteSummary.getByText('Ready', { exact: true })).toBeVisible();
      await expect(prerequisiteSummary.getByText('Collection path')).toBeVisible();
      await expect(prerequisiteSummary.getByText('Missing', { exact: true })).toBeVisible();

      await expect(
        collectionSummary.getByText(
          'No success-fee collection path is recorded yet. Save one before moving this accepted case into negotiation or court.'
        )
      ).toBeVisible();
    } finally {
      if (existingAgreement?.id) {
        await db
          .update(claimEscalationAgreements)
          .set({
            acceptedAt: existingAgreement.acceptedAt,
            acceptedById: existingAgreement.acceptedById,
            decisionType: existingAgreement.decisionType,
            declineReasonCode: existingAgreement.declineReasonCode,
            decisionNextStatus: existingAgreement.decisionNextStatus,
            decisionReason: existingAgreement.decisionReason,
            signedByUserId: existingAgreement.signedByUserId,
            feePercentage: existingAgreement.feePercentage,
            minimumFee: existingAgreement.minimumFee,
            legalActionCapPercentage: existingAgreement.legalActionCapPercentage,
            paymentAuthorizationState: existingAgreement.paymentAuthorizationState,
            successFeeRecoveredAmount: existingAgreement.successFeeRecoveredAmount,
            successFeeCurrencyCode: existingAgreement.successFeeCurrencyCode,
            successFeeAmount: existingAgreement.successFeeAmount,
            successFeeCollectionMethod: existingAgreement.successFeeCollectionMethod,
            successFeeDeductionAllowed: existingAgreement.successFeeDeductionAllowed,
            successFeeHasStoredPaymentMethod: existingAgreement.successFeeHasStoredPaymentMethod,
            successFeeInvoiceDueAt: existingAgreement.successFeeInvoiceDueAt,
            successFeeResolvedAt: existingAgreement.successFeeResolvedAt,
            successFeeResolvedById: existingAgreement.successFeeResolvedById,
            successFeeSubscriptionId: existingAgreement.successFeeSubscriptionId,
            termsVersion: existingAgreement.termsVersion,
            signedAt: existingAgreement.signedAt,
            updatedAt: existingAgreement.updatedAt ?? now,
          })
          .where(eq(claimEscalationAgreements.id, existingAgreement.id));
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
