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
    tenantId?: string | null;
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
  if (!session) {
    throw new UnauthorizedError();
  }
  if (!session.user) {
    throw new UnauthorizedError('Unauthorized: No user in session');
  }
  const tenantId = session.user.tenantId;
  if (!tenantId) {
    throw new MissingTenantError();
  }
  return tenantId;
}
