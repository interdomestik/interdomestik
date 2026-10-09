import { CLAIM_STATUSES } from '@interdomestik/database/constants';

// Pure outcome helpers for admin ops server actions. Deliberately free of auth/db/next imports so
// action tests exercise the real sanitizer and post-commit truthfulness instead of mocks.

export type OpsActionResult =
  | { success: true; message?: string; data?: unknown; refreshPending?: true }
  | { success: false; error: string };

export type OpsActionFailure = Extract<OpsActionResult, { success: false }>;

// Structured marker for a committed write whose post-commit revalidation failed. Clients drive the
// refresh-pending UI from this flag only; they never compare or display the message text.
export type OpsCommittedRefreshPendingResult = Extract<OpsActionResult, { success: true }> & {
  refreshPending: true;
};

export const OPS_ACTION_UNAUTHORIZED_ERROR = 'Unauthorized';
export const OPS_ACTION_FAILED_ERROR = 'Action failed. Please try again.';
export const OPS_CLAIM_CHANGED_ERROR =
  'This claim changed before the update could be saved. Reload and try again.';
// Compatibility/privacy-safe text only. UI copy is localized client-side and keyed off refreshPending.
export const OPS_COMMITTED_REFRESH_PENDING_MESSAGE =
  'Saved. Reload the page if the latest state is not shown.';

// Fixed, expected domain denials. Messages carry no SQL, bound parameters or PII and are safe to
// return verbatim; every other error is mapped to OPS_ACTION_FAILED_ERROR.
const SAFE_DOMAIN_DENIALS: ReadonlySet<string> = new Set([
  'Claim not found or access denied',
  ...['assign', 'poke', 'sla_ack'].map(intent => `Cannot perform ${intent} on a terminal claim.`),
  ...CLAIM_STATUSES.flatMap(from =>
    CLAIM_STATUSES.map(to => `Illegal transition from ${from} to ${to}`)
  ),
]);

export class OpsDomainDenialError extends Error {
  constructor(message: string) {
    super(SAFE_DOMAIN_DENIALS.has(message) ? message : OPS_ACTION_FAILED_ERROR);
    this.name = 'OpsDomainDenialError';
  }
}

// Matched by name so this module stays dependency-free; the canonical class lives in
// domain-claims transition side effects and signals a lifecycle CAS conflict (rolled back).
const TRANSITION_CONFLICT_ERROR_NAME = 'ClaimTransitionConflictError';

export function toSafeOpsActionError(
  actionName: 'updateStatus' | 'markSlaAcknowledged' | 'sendMemberReminder',
  error: unknown
): OpsActionFailure {
  if (error instanceof OpsDomainDenialError) return { success: false, error: error.message };
  if (error instanceof Error && error.name === TRANSITION_CONFLICT_ERROR_NAME) {
    return { success: false, error: OPS_CLAIM_CHANGED_ERROR };
  }
  // Never log or return raw errors: driver messages embed SQL text and bound parameters.
  console.error(`Action Failed: ${actionName}`, 'unexpected_failure');
  return { success: false, error: OPS_ACTION_FAILED_ERROR };
}

// Called only after the tenant transaction committed. A revalidation failure must not relabel
// the persisted mutation as failed (which would invite a duplicate retry); report success with
// a structured refreshPending marker instead, and never re-run the mutation. The message string
// is kept for compatibility only; the marker is what drives the UI.
export function completeCommittedOpsAction(
  actionName: 'updateStatus' | 'markSlaAcknowledged' | 'sendMemberReminder',
  revalidate: () => void
): OpsActionResult {
  try {
    revalidate();
  } catch {
    console.error(`Revalidation failed after commit: ${actionName}`, 'revalidation_failure');
    return {
      success: true,
      message: OPS_COMMITTED_REFRESH_PENDING_MESSAGE,
      refreshPending: true,
    };
  }
  return { success: true };
}

// Client-safe structural guard. Only the typed marker counts; message text is never inspected.
export function isCommittedRefreshPending(
  result: unknown
): result is OpsCommittedRefreshPendingResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    (result as { success?: unknown }).success === true &&
    (result as { refreshPending?: unknown }).refreshPending === true
  );
}
