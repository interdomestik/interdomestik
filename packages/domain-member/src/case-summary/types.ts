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
  occurredAt?: string;
};

export type ProjectedAccidentSummary = AccidentSummary & { occurredAt: string };

export type GenericCaseSummary = Omit<AccidentSummary, 'caseKind' | 'occurredAt'> & {
  caseKind: 'generic';
  occurredAt: string;
};

export type CaseSummary = ProjectedAccidentSummary | GenericCaseSummary;
export type CaseKind = AccidentSummary['caseKind'];
export type CaseSummaryKind = CaseSummary['caseKind'];
