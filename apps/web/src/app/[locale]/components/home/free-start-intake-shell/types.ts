import type {
  FreeStartCategoryId as CategoryId,
  FreeStartIssueId as IssueId,
  FreeStartOutcomeId as OutcomeId,
} from '@/lib/free-start-contract';
import type { getSupportContacts } from '@/lib/support-contacts';

export type FreeStartIntakeShellProps = Readonly<{
  continueHref: string;
  locale: string;
  tenantId?: string | null;
}>;

export type StepId = 'category' | 'details' | 'preview' | 'complete';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type ContinueRouteKey = 'membership' | 'member' | 'portal';
export type EvidenceItemId = 'first' | 'second' | 'third';

export type DraftState = {
  issueType: IssueId | '';
  incidentDate: string;
  counterparty: string;
  desiredOutcome: OutcomeId | '';
  summary: string;
};

export type DraftField = keyof DraftState;
export type FreeStartCopy = (key: string) => string;
export type SupportContacts = ReturnType<typeof getSupportContacts>;
export type SetDraftField = <K extends DraftField>(field: K, value: DraftState[K]) => void;

export type { CategoryId, IssueId, OutcomeId };
