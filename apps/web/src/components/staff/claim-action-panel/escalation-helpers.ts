import type {
  ClaimStatus,
  EscalationDecisionNextStatus,
  PaymentAuthorizationState,
  SuccessFeeCollectionSnapshot,
} from '@/actions/staff-claims.core';

import type { TranslateFn } from './format-helpers';

export const RECOVERY_START_STATUSES: ReadonlySet<ClaimStatus> = new Set(['negotiation', 'court']);

export function getDefaultDecisionNextStatus(currentStatus: string): EscalationDecisionNextStatus {
  return currentStatus === 'court' ? 'court' : 'negotiation';
}

export function formatCollectionMethodLabel(
  method: SuccessFeeCollectionSnapshot['collectionMethod'],
  t: TranslateFn
) {
  switch (method) {
    case 'deduction':
      return t('staff_actions.success_fee.collection_method_options.deduction');
    case 'payment_method_charge':
      return t('staff_actions.success_fee.collection_method_options.payment_method_charge');
    case 'invoice':
      return t('staff_actions.success_fee.collection_method_options.invoice');
    default:
      return method;
  }
}

export function getPaymentAuthorizationLabel(value: PaymentAuthorizationState, t: TranslateFn) {
  return t(`staff_actions.escalation_agreement.payment_authorization_options.${value}`);
}
