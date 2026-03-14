import type {
  MemberSafeRecoveryDecisionSnapshot,
  RecoveryDeclineReasonCode,
  RecoveryDecisionSnapshot,
  RecoveryDecisionType,
} from './types';

type DateLike = Date | string | null | undefined;

type RecoveryDecisionRecord = {
  decidedAt?: DateLike;
  declineReasonCode?: RecoveryDeclineReasonCode | null;
  decisionType?: RecoveryDecisionType | null;
  explanation?: string | null;
};

const ACCEPTED_STAFF_LABEL = 'Accepted for staff-led recovery';
const ACCEPTED_MEMBER_LABEL = 'Accepted for staff-led recovery';
const ACCEPTED_MEMBER_DESCRIPTION = 'We accepted this matter for staff-led recovery.';
const PENDING_STAFF_LABEL = 'Pending staff decision';

const DECLINE_REASON_DETAILS: Record<
  RecoveryDeclineReasonCode,
  {
    memberDescription: string;
    memberLabel: string;
    staffLabel: string;
  }
> = {
  guidance_only_scope: {
    staffLabel: 'Guidance-only or referral-only under current scope',
    memberLabel: 'Guidance-only or referral-only matter',
    memberDescription:
      'This matter stays guidance-only or referral-only under the current launch scope.',
  },
  insufficient_evidence: {
    staffLabel: 'Insufficient evidence for staff-led recovery',
    memberLabel: 'More evidence is needed',
    memberDescription: 'We need stronger supporting evidence before staff-led recovery can start.',
  },
  no_monetary_recovery_path: {
    staffLabel: 'No clear monetary recovery path',
    memberLabel: 'No clear monetary recovery path',
    memberDescription:
      'This matter does not currently show a clear monetary recovery path for staff-led recovery.',
  },
  counterparty_unidentified: {
    staffLabel: 'Counterparty or insurer cannot be identified',
    memberLabel: 'Counterparty details are still missing',
    memberDescription:
      'We cannot identify the insurer or counterparty needed to pursue staff-led recovery.',
  },
  time_limit_risk: {
    staffLabel: 'Time-limit risk blocks staff-led recovery',
    memberLabel: 'Time limit risk',
    memberDescription: 'This matter appears outside the time limit for staff-led recovery.',
  },
  conflict_or_integrity_concern: {
    staffLabel: 'Conflict of interest or integrity concern',
    memberLabel: 'Cannot accept for staff-led recovery',
    memberDescription: 'We cannot accept this matter for staff-led recovery.',
  },
};

function normalizeDate(value: DateLike) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function getRecoveryDeclineReasonDetails(code: RecoveryDeclineReasonCode) {
  return DECLINE_REASON_DETAILS[code];
}

export function getRecoveryDeclineMemberDescription(code: RecoveryDeclineReasonCode) {
  return getRecoveryDeclineReasonDetails(code).memberDescription;
}

export function buildRecoveryDecisionSnapshot(
  record: RecoveryDecisionRecord | null | undefined
): RecoveryDecisionSnapshot {
  if (!record?.decisionType) {
    return {
      status: 'pending',
      decidedAt: null,
      explanation: null,
      declineReasonCode: null,
      staffLabel: PENDING_STAFF_LABEL,
      memberLabel: null,
      memberDescription: null,
    };
  }

  if (record.decisionType === 'accepted') {
    return {
      status: 'accepted',
      decidedAt: normalizeDate(record.decidedAt),
      explanation: record.explanation?.trim() || null,
      declineReasonCode: null,
      staffLabel: ACCEPTED_STAFF_LABEL,
      memberLabel: ACCEPTED_MEMBER_LABEL,
      memberDescription: ACCEPTED_MEMBER_DESCRIPTION,
    };
  }

  const declineReasonCode = record.declineReasonCode ?? 'guidance_only_scope';
  const details = getRecoveryDeclineReasonDetails(declineReasonCode);

  return {
    status: 'declined',
    decidedAt: normalizeDate(record.decidedAt),
    explanation: record.explanation?.trim() || null,
    declineReasonCode,
    staffLabel: details.staffLabel,
    memberLabel: details.memberLabel,
    memberDescription: details.memberDescription,
  };
}

export function toMemberSafeRecoveryDecision(
  snapshot: RecoveryDecisionSnapshot | null | undefined
): MemberSafeRecoveryDecisionSnapshot | null {
  if (!snapshot || snapshot.status === 'pending' || !snapshot.memberLabel) {
    return null;
  }

  return {
    status: snapshot.status,
    title: snapshot.memberLabel,
    description: snapshot.memberDescription,
  };
}
