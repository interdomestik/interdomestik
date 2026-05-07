import { FREE_START_ISSUES_BY_CATEGORY, FREE_START_OUTCOME_IDS } from '@/lib/free-start-contract';
import { Car, Home, Stethoscope } from 'lucide-react';

import type { CategoryId, DraftState, EvidenceItemId, IssueId, OutcomeId } from './types';

export const CATEGORY_CONFIG: ReadonlyArray<{
  icon: typeof Car;
  id: CategoryId;
  issueIds: ReadonlyArray<IssueId>;
}> = [
  {
    icon: Car,
    id: 'vehicle',
    issueIds: FREE_START_ISSUES_BY_CATEGORY.vehicle,
  },
  {
    icon: Home,
    id: 'property',
    issueIds: FREE_START_ISSUES_BY_CATEGORY.property,
  },
  {
    icon: Stethoscope,
    id: 'injury',
    issueIds: FREE_START_ISSUES_BY_CATEGORY.injury,
  },
];

export const OUTCOME_IDS: ReadonlyArray<OutcomeId> = FREE_START_OUTCOME_IDS;
export const EVIDENCE_ITEM_IDS: ReadonlyArray<EvidenceItemId> = ['first', 'second', 'third'];

export const EMPTY_DRAFT: DraftState = {
  issueType: '',
  incidentDate: '',
  counterparty: '',
  desiredOutcome: '',
  summary: '',
};
