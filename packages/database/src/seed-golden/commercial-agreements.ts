import type { SeedConfig } from '../seed-types';
import { goldenId } from '../seed-utils/seed-ids';
import type { ClaimEscalationAgreementInsert, SeedGoldenDb, SeedGoldenSchema } from './types';

export function buildCommercialAgreementsToSeed(args: {
  at: SeedConfig['at'];
  tenantId: string;
  staffId: string;
}): ClaimEscalationAgreementInsert[] {
  const { at, staffId, tenantId } = args;

  return [
    {
      id: goldenId('ks_a_claim_14_agreement'),
      tenantId,
      claimId: goldenId('ks_a_claim_14'),
      acceptedById: staffId,
      acceptedAt: at(-2 * 24 * 60 * 60 * 1000),
      decisionType: 'accepted',
      declineReasonCode: null,
      decisionNextStatus: 'negotiation',
      decisionReason: 'Accepted pending member signature on the commercial terms.',
      signedByUserId: goldenId('ks_a_member_2'),
      feePercentage: 18,
      minimumFee: '25.00',
      legalActionCapPercentage: 30,
      paymentAuthorizationState: 'pending',
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
      signedAt: null,
      createdAt: at(-2 * 24 * 60 * 60 * 1000),
      updatedAt: at(-1 * 24 * 60 * 60 * 1000),
    },
    {
      id: goldenId('ks_a_claim_15_agreement'),
      tenantId,
      claimId: goldenId('ks_a_claim_15'),
      acceptedById: staffId,
      acceptedAt: at(-4 * 24 * 60 * 60 * 1000),
      decisionType: 'accepted',
      declineReasonCode: null,
      decisionNextStatus: 'negotiation',
      decisionReason: 'Accepted with deduction from payout available.',
      signedByUserId: goldenId('ks_a_member_3'),
      feePercentage: 20,
      minimumFee: '25.00',
      legalActionCapPercentage: 35,
      paymentAuthorizationState: 'authorized',
      successFeeRecoveredAmount: '1000.00',
      successFeeCurrencyCode: 'EUR',
      successFeeAmount: '200.00',
      successFeeCollectionMethod: 'deduction',
      successFeeDeductionAllowed: true,
      successFeeHasStoredPaymentMethod: false,
      successFeeInvoiceDueAt: null,
      successFeeResolvedAt: at(-3 * 24 * 60 * 60 * 1000),
      successFeeResolvedById: staffId,
      successFeeSubscriptionId: null,
      termsVersion: '2026-03-v1',
      signedAt: at(-4 * 24 * 60 * 60 * 1000),
      createdAt: at(-4 * 24 * 60 * 60 * 1000),
      updatedAt: at(-3 * 24 * 60 * 60 * 1000),
    },
    {
      id: goldenId('ks_a_claim_16_agreement'),
      tenantId,
      claimId: goldenId('ks_a_claim_16'),
      acceptedById: staffId,
      acceptedAt: at(-5 * 24 * 60 * 60 * 1000),
      decisionType: 'accepted',
      declineReasonCode: null,
      decisionNextStatus: 'court',
      decisionReason:
        'Accepted with invoice fallback because deduction and stored charge are unavailable.',
      signedByUserId: goldenId('ks_a_member_4'),
      feePercentage: 22,
      minimumFee: '25.00',
      legalActionCapPercentage: 40,
      paymentAuthorizationState: 'authorized',
      successFeeRecoveredAmount: '1500.00',
      successFeeCurrencyCode: 'EUR',
      successFeeAmount: '330.00',
      successFeeCollectionMethod: 'invoice',
      successFeeDeductionAllowed: false,
      successFeeHasStoredPaymentMethod: false,
      successFeeInvoiceDueAt: at(2 * 24 * 60 * 60 * 1000),
      successFeeResolvedAt: at(-4 * 24 * 60 * 60 * 1000),
      successFeeResolvedById: staffId,
      successFeeSubscriptionId: null,
      termsVersion: '2026-03-v1',
      signedAt: at(-5 * 24 * 60 * 60 * 1000),
      createdAt: at(-5 * 24 * 60 * 60 * 1000),
      updatedAt: at(-4 * 24 * 60 * 60 * 1000),
    },
    {
      id: goldenId('ks_a_claim_17_agreement'),
      tenantId,
      claimId: goldenId('ks_a_claim_17'),
      acceptedById: staffId,
      acceptedAt: at(-6 * 24 * 60 * 60 * 1000),
      decisionType: 'accepted',
      declineReasonCode: null,
      decisionNextStatus: 'negotiation',
      decisionReason: 'Accepted with stored payment method fallback available.',
      signedByUserId: goldenId('ks_a_member_1'),
      feePercentage: 19,
      minimumFee: '25.00',
      legalActionCapPercentage: 30,
      paymentAuthorizationState: 'authorized',
      successFeeRecoveredAmount: '900.00',
      successFeeCurrencyCode: 'EUR',
      successFeeAmount: '171.00',
      successFeeCollectionMethod: 'payment_method_charge',
      successFeeDeductionAllowed: false,
      successFeeHasStoredPaymentMethod: true,
      successFeeInvoiceDueAt: null,
      successFeeResolvedAt: at(-5 * 24 * 60 * 60 * 1000),
      successFeeResolvedById: staffId,
      successFeeSubscriptionId: goldenId('sub_ks_a_1'),
      termsVersion: '2026-03-v1',
      signedAt: at(-6 * 24 * 60 * 60 * 1000),
      createdAt: at(-6 * 24 * 60 * 60 * 1000),
      updatedAt: at(-5 * 24 * 60 * 60 * 1000),
    },
  ];
}

export async function upsertCommercialAgreements(args: {
  agreements: ClaimEscalationAgreementInsert[];
  db: SeedGoldenDb;
  schema: SeedGoldenSchema;
}) {
  const { agreements, db, schema } = args;

  for (const agreement of agreements) {
    await db
      .insert(schema.claimEscalationAgreements)
      .values(agreement)
      .onConflictDoUpdate({
        target: schema.claimEscalationAgreements.claimId,
        set: {
          acceptedAt: agreement.acceptedAt,
          acceptedById: agreement.acceptedById,
          decisionType: agreement.decisionType,
          declineReasonCode: agreement.declineReasonCode,
          decisionNextStatus: agreement.decisionNextStatus,
          decisionReason: agreement.decisionReason,
          signedByUserId: agreement.signedByUserId,
          feePercentage: agreement.feePercentage,
          minimumFee: agreement.minimumFee,
          legalActionCapPercentage: agreement.legalActionCapPercentage,
          paymentAuthorizationState: agreement.paymentAuthorizationState,
          successFeeRecoveredAmount: agreement.successFeeRecoveredAmount,
          successFeeCurrencyCode: agreement.successFeeCurrencyCode,
          successFeeAmount: agreement.successFeeAmount,
          successFeeCollectionMethod: agreement.successFeeCollectionMethod,
          successFeeDeductionAllowed: agreement.successFeeDeductionAllowed,
          successFeeHasStoredPaymentMethod: agreement.successFeeHasStoredPaymentMethod,
          successFeeInvoiceDueAt: agreement.successFeeInvoiceDueAt,
          successFeeResolvedAt: agreement.successFeeResolvedAt,
          successFeeResolvedById: agreement.successFeeResolvedById,
          successFeeSubscriptionId: agreement.successFeeSubscriptionId,
          termsVersion: agreement.termsVersion,
          signedAt: agreement.signedAt,
          updatedAt: agreement.updatedAt,
        },
      });
  }
}
