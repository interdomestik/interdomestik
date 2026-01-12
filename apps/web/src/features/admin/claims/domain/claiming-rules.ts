import { ClaimStatus } from '@interdomestik/database/constants';

/**
 * Defines allowed status transitions to prevent invalid lifecycle jumps.
 * Used by the UI to filter available target statuses in the picker.
 */
export const ALLOWED_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  draft: ['submitted'],
  submitted: ['verification', 'evaluation', 'rejected'],
  verification: ['evaluation', 'submitted'], // Can go back to submitted or straight to evaluation
  evaluation: ['negotiation', 'verification', 'rejected', 'resolved'],
  negotiation: ['court', 'resolved', 'evaluation', 'rejected'],
  court: ['resolved', 'rejected', 'negotiation'],
  resolved: ['evaluation', 'negotiation'], // Reopening usually requires re-evaluation
  rejected: ['evaluation', 'submitted'], // Reopening
};

/**
 * Checks if a transition is valid.
 */
export function isTransitionAllowed(from: ClaimStatus, to: ClaimStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}
