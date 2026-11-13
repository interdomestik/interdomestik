import {
  ASSIGNMENT_CONFLICT_ERROR,
  ASSIGNMENT_DRAFT_ERROR,
  ASSIGNMENT_TARGET_DENIED_ERROR,
} from '../../actions/ops-assignment-errors';

/** Keys under `admin.claims_page.assignment`. */
export type AssignmentErrorToastKey = 'errors.conflict' | 'errors.draft' | 'errors.target_denied';

const ASSIGNMENT_ERROR_TOASTS: ReadonlyMap<string, AssignmentErrorToastKey> = new Map([
  [ASSIGNMENT_CONFLICT_ERROR, 'errors.conflict'],
  [ASSIGNMENT_DRAFT_ERROR, 'errors.draft'],
  [ASSIGNMENT_TARGET_DENIED_ERROR, 'errors.target_denied'],
]);

/**
 * Localized toast key for a known assignment denial. Server error text is English and never shown
 * as-is: unknown failures return null so the caller falls back to its generic localized failure.
 */
export function assignmentErrorToastKey(
  error: string | null | undefined
): AssignmentErrorToastKey | null {
  return ASSIGNMENT_ERROR_TOASTS.get(error ?? '') ?? null;
}
