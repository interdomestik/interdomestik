// Kept apart from the conversion so callers can classify its failure without loading the database.
export const MEMBER_EMAIL_CONFLICT = 'MEMBER_EMAIL_CONFLICT';

/**
 * The lead's email already belongs to an account, in this tenant or another (letter case ignored).
 * Nothing is attached or reassigned: the conversion stays pending for an operator to reconcile.
 */
export class MemberEmailConflictError extends Error {
  readonly code = MEMBER_EMAIL_CONFLICT;
  constructor() {
    super('The lead email already belongs to an account');
    this.name = 'MemberEmailConflictError';
  }
}

export function isMemberEmailConflictError(error: unknown): error is MemberEmailConflictError {
  return (error as { code?: unknown } | null)?.code === MEMBER_EMAIL_CONFLICT;
}
