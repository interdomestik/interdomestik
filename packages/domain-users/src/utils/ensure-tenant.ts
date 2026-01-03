/**
 * Utility to ensure a valid tenant ID is present in a session.
 * Use this for all session-based code paths to enforce multi-tenant data isolation.
 *
 * For service-level flows without a session (cron jobs, webhooks, push notifications),
 * use the DB-provided tenantId or fallback explicitly.
 */

type SessionWithTenant = {
  user?: { tenantId?: string | null } | null;
} | null;

/**
 * Extracts and validates the tenant ID from a session.
 *
 * @throws Error if session is missing (unauthenticated)
 * @throws Error if session.user is missing (unauthenticated)
 * @throws Error if tenantId is missing from session (data integrity issue)
 * @returns The validated tenant ID
 */
export function ensureTenantId(session: SessionWithTenant): string {
  if (!session) {
    throw new Error('Unauthorized: No active session');
  }
  if (!session.user) {
    throw new Error('Unauthorized: No user in session');
  }
  const tenantId = session.user.tenantId;
  if (!tenantId) {
    throw new Error(
      'Session missing tenantId. This indicates a data integrity issue - all users should have a tenantId.'
    );
  }
  return tenantId;
}
