import type {
  RecoveryDecisionSnapshot,
  RecoveryDeclineReasonCode,
} from '@/actions/staff-claims.core';

import type { TranslateFn } from './format-helpers';

export function getRecoveryDeclineReasonOptions(t: TranslateFn) {
  return [
    {
      value: 'guidance_only_scope' as const,
      label: t('staff_actions.recovery_decision.decline_reasons.guidance_only_scope'),
    },
    {
      value: 'insufficient_evidence' as const,
      label: t('staff_actions.recovery_decision.decline_reasons.insufficient_evidence'),
    },
    {
      value: 'no_monetary_recovery_path' as const,
      label: t('staff_actions.recovery_decision.decline_reasons.no_monetary_recovery_path'),
    },
    {
      value: 'counterparty_unidentified' as const,
      label: t('staff_actions.recovery_decision.decline_reasons.counterparty_unidentified'),
    },
    {
      value: 'time_limit_risk' as const,
      label: t('staff_actions.recovery_decision.decline_reasons.time_limit_risk'),
    },
    {
      value: 'conflict_or_integrity_concern' as const,
      label: t('staff_actions.recovery_decision.decline_reasons.conflict_or_integrity_concern'),
    },
  ] satisfies ReadonlyArray<{
    value: RecoveryDeclineReasonCode;
    label: string;
  }>;
}

export const RECOVERY_DECISION_LABELS = {
  en: {
    pending: 'Pending staff decision',
    accepted: 'Accepted for staff-led recovery',
    declined: 'Declined for staff-led recovery',
  },
  sq: {
    pending: 'Në pritje të vendimit të stafit',
    accepted: 'Pranuar për rikuperim të udhëhequr nga stafi',
    declined: 'Refuzuar për rikuperim të udhëhequr nga stafi',
  },
  mk: {
    pending: 'Се чека одлука од персоналот',
    accepted: 'Прифатено за наплата водена од персоналот',
    declined: 'Одбиено за наплата водена од персоналот',
  },
  sr: {
    pending: 'Na čekanju odluke osoblja',
    accepted: 'Prihvaćeno za naplatu koju vodi osoblje',
    declined: 'Odbijeno za naplatu koju vodi osoblje',
  },
} as const;

export function getRecoveryDecisionLabel(snapshot: RecoveryDecisionSnapshot, locale: string) {
  const labels =
    RECOVERY_DECISION_LABELS[locale as keyof typeof RECOVERY_DECISION_LABELS] ??
    RECOVERY_DECISION_LABELS.en;

  switch (snapshot.status) {
    case 'accepted':
      return snapshot.staffLabel;
    case 'declined':
      return snapshot.staffLabel;
    default:
      return labels.pending;
  }
}
