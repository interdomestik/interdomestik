import type { CategoryId, DraftState } from './types';

export function hasIncompleteDraft(
  selectedCategory: CategoryId | null,
  draft: DraftState
): boolean {
  return (
    selectedCategory === null ||
    draft.issueType.trim().length === 0 ||
    draft.incidentDate.trim().length === 0 ||
    draft.counterparty.trim().length === 0 ||
    draft.desiredOutcome.trim().length === 0 ||
    draft.summary.trim().length === 0
  );
}
