/**
 * Shared session types and utilities for multi-tenant authentication.
 */

import { MissingTenantError, UnauthorizedError } from './errors';

/**
 * Minimal session type with tenant information.
 * Includes user.id for common use cases.
 */
export type SessionWithTenant = {
  user?: {
    id?: string;
    accessTenantId?: string | null;
    bookingTenantId?: string | null;
    legalTenantId?: string | null;
    recoveryLegalTenantId?: string | null;
    hostTenantId?: string | null;
    tenantId?: string | null;
    role?: string | null;
    branchId?: string | null;
    agentId?: string | null;
  } | null;
} | null;

/**
 * Extracts and validates the tenant ID from a session.
 *
 * @throws UnauthorizedError if session is missing or has no user
 * @throws MissingTenantError if tenantId is missing (data integrity issue)
 * @returns The validated tenant ID
 */
export function ensureTenantId(session: SessionWithTenant): string {
  return ensureAccessTenantId(session);
}

/**
 * Extracts and validates the access tenant from a session.
 *
 * `tenantId` remains a compatibility fallback while callers migrate to the
 * explicit `accessTenantId` session concept.
 */
export function ensureAccessTenantId(session: SessionWithTenant): string {
  if (!session) {
    throw new UnauthorizedError();
  }
  if (!session.user) {
    throw new UnauthorizedError('Unauthorized: No user in session');
  }
  const accessTenantId = session.user.accessTenantId?.trim() || session.user.tenantId?.trim();
  if (!accessTenantId) {
    throw new MissingTenantError();
  }
  return accessTenantId;
}
