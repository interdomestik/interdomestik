export type CaseLifecycleStatus =
  | 'draft'
  | 'submitted'
  | 'submitted_to_airline'
  | 'verification'
  | 'evaluation'
  | 'negotiation'
  | 'court'
  | 'resolved'
  | 'rejected';

export type NextStepToken =
  'member_action' | 'team_review' | 'external_response' | 'court_schedule' | 'complete';

export type AccidentSummary = {
  caseKind: 'accident';
  id: string;
  reference: string | null;
  status: CaseLifecycleStatus;
  documentCount: number;
  nextStep: NextStepToken;
};

export type CaseSummary = AccidentSummary;
export type CaseKind = CaseSummary['caseKind'];
