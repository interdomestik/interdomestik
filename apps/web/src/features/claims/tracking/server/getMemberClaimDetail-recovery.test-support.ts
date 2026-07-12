export function buildRecoveryDecisionSnapshotMock(
  record: Record<string, unknown> | null | undefined
) {
  if (!record?.decisionType) {
    return {
      status: 'pending',
      decidedAt: null,
      explanation: null,
      declineReasonCode: null,
      staffLabel: 'Pending staff decision',
      memberLabel: null,
      memberDescription: null,
    };
  }
  if (record.decisionType === 'accepted') {
    return {
      status: 'accepted',
      decidedAt: record.decidedAt ?? null,
      explanation: record.explanation ?? null,
      declineReasonCode: null,
      staffLabel: 'Accepted for staff-led recovery',
      memberLabel: 'Accepted for staff-led recovery',
      memberDescription: 'We accepted this matter for staff-led recovery.',
    };
  }
  return {
    status: 'declined',
    decidedAt: record.decidedAt ?? null,
    explanation: record.explanation ?? null,
    declineReasonCode: record.declineReasonCode ?? null,
    staffLabel: 'Guidance-only or referral-only under current scope',
    memberLabel: 'Guidance-only or referral-only matter',
    memberDescription:
      'This matter stays guidance-only or referral-only under the current launch scope.',
  };
}

export function toMemberSafeRecoveryDecisionMock(
  snapshot: Record<string, unknown> | null | undefined
) {
  if (!snapshot || snapshot.status === 'pending') return null;
  return {
    status: snapshot.status,
    title: snapshot.memberLabel,
    description: snapshot.memberDescription ?? null,
  };
}
