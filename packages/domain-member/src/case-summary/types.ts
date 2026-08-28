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
  occurredAt?: string | null;
};

export type ProjectedAccidentSummary = AccidentSummary & { occurredAt: string | null };

export type GenericCaseSummary = Omit<ProjectedAccidentSummary, 'caseKind'> & {
  caseKind: 'generic';
};

export type CaseSummary = ProjectedAccidentSummary | GenericCaseSummary;
export type CaseKind = AccidentSummary['caseKind'];
export type CaseSummaryKind = CaseSummary['caseKind'];
