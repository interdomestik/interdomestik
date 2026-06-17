/**
 * Shared authentication utilities for multi-tenant applications.
 * This package has no external dependencies to avoid circular imports.
 */

// Error types
export { AuthError, MissingTenantError, UnauthorizedError } from './errors';

// Session types and utilities
export { ensureAccessTenantId, ensureTenantId, type SessionWithTenant } from './session';

// RBAC and Scoping
export * from './access-grants';
export * from './permissions';
export * from './scope';
export * from './governance';
