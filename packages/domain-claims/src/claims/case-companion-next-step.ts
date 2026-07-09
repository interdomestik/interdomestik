import type { ClaimStatus } from '@interdomestik/database/constants';

export type CaseCompanionOwner = 'member' | 'interdomestik' | 'insurer' | 'court';
export type CaseCompanionActionKind = 'action' | 'no_action';
export type CaseCompanionAwaitingDateReason =
  | 'member_action_required'
  | 'case_team_review'
  | 'external_party'
  | 'court_schedule'
  | 'outcome_recorded'
  | 'erased_subject';

export type CaseCompanionNextStep = {
  owner: CaseCompanionOwner;
  statusSentenceKey: string;
  actionKind: CaseCompanionActionKind;
  actionKey: string;
  nextStepDate: Date | null;
  awaitingDateReason: CaseCompanionAwaitingDateReason | null;
  renderMode: 'standard' | 'erased';
};

type NextStepTemplate = Omit<
  CaseCompanionNextStep,
  'nextStepDate' | 'renderMode' | 'awaitingDateReason'
> & {
  awaitingDateReason: CaseCompanionAwaitingDateReason;
};

const NEXT_STEP_BY_STATUS = {
  draft: {
    owner: 'member',
    statusSentenceKey: 'claims-tracking.case_companion.status_sentence.draft',
    actionKind: 'action',
    actionKey: 'claims-tracking.case_companion.action.submit_claim',
    awaitingDateReason: 'member_action_required',
  },
  submitted: {
    owner: 'interdomestik',
    statusSentenceKey: 'claims-tracking.case_companion.status_sentence.submitted',
    actionKind: 'no_action',
    actionKey: 'claims-tracking.case_companion.action.no_action',
    awaitingDateReason: 'case_team_review',
  },
  submitted_to_airline: {
    owner: 'insurer',
    statusSentenceKey: 'claims-tracking.case_companion.status_sentence.submitted_to_airline',
    actionKind: 'no_action',
    actionKey: 'claims-tracking.case_companion.action.no_action',
    awaitingDateReason: 'external_party',
  },
  verification: {
    owner: 'member',
    statusSentenceKey: 'claims-tracking.case_companion.status_sentence.verification',
    actionKind: 'action',
    actionKey: 'claims-tracking.case_companion.action.upload_evidence',
    awaitingDateReason: 'member_action_required',
  },
  evaluation: {
    owner: 'interdomestik',
    statusSentenceKey: 'claims-tracking.case_companion.status_sentence.evaluation',
    actionKind: 'no_action',
    actionKey: 'claims-tracking.case_companion.action.no_action',
    awaitingDateReason: 'case_team_review',
  },
  negotiation: {
    owner: 'insurer',
    statusSentenceKey: 'claims-tracking.case_companion.status_sentence.negotiation',
    actionKind: 'no_action',
    actionKey: 'claims-tracking.case_companion.action.no_action',
    awaitingDateReason: 'external_party',
  },
  court: {
    owner: 'court',
    statusSentenceKey: 'claims-tracking.case_companion.status_sentence.court',
    actionKind: 'no_action',
    actionKey: 'claims-tracking.case_companion.action.no_action',
    awaitingDateReason: 'court_schedule',
  },
  resolved: {
    owner: 'interdomestik',
    statusSentenceKey: 'claims-tracking.case_companion.status_sentence.resolved',
    actionKind: 'no_action',
    actionKey: 'claims-tracking.case_companion.action.complete',
    awaitingDateReason: 'outcome_recorded',
  },
  rejected: {
    owner: 'interdomestik',
    statusSentenceKey: 'claims-tracking.case_companion.status_sentence.rejected',
    actionKind: 'no_action',
    actionKey: 'claims-tracking.case_companion.action.complete',
    awaitingDateReason: 'outcome_recorded',
  },
} as const satisfies Record<ClaimStatus, NextStepTemplate>;

export function deriveCaseCompanionNextStep(input: {
  status: ClaimStatus;
  latestUpdateAt?: Date | null;
  piiStatus?: 'available' | 'erased_or_unavailable';
}): CaseCompanionNextStep {
  if (input.piiStatus === 'erased_or_unavailable') {
    return {
      owner: 'interdomestik',
      statusSentenceKey: 'claims-tracking.case_companion.status_sentence.redacted',
      actionKind: 'no_action',
      actionKey: 'claims-tracking.case_companion.action.no_action',
      nextStepDate: null,
      awaitingDateReason: 'erased_subject',
      renderMode: 'erased',
    };
  }

  const template = NEXT_STEP_BY_STATUS[input.status];
  const canDisplayDate = template.awaitingDateReason === 'outcome_recorded';
  const hasDisplayDate = canDisplayDate && input.latestUpdateAt != null;

  return {
    ...template,
    nextStepDate: hasDisplayDate ? (input.latestUpdateAt ?? null) : null,
    awaitingDateReason: hasDisplayDate ? null : template.awaitingDateReason,
    renderMode: 'standard',
  };
}
