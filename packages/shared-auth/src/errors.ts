/**
 * Custom authentication error classes.
 * Safe to surface in logs - no sensitive data leakage.
 */

/**
 * Base authentication error.
 */
export class AuthError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = 'AuthError';
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

/**
 * Thrown when no valid session exists.
 */
export class UnauthorizedError extends AuthError {
  constructor(message = 'Unauthorized: No active session') {
    super(message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * Thrown when session exists but tenantId is missing.
 * Indicates a data integrity issue - all users should have a tenantId.
 */
export class MissingTenantError extends AuthError {
  constructor(message = 'Session missing tenantId. Data integrity issue.') {
    super(message, 'MISSING_TENANT');
    this.name = 'MissingTenantError';
    Object.setPrototypeOf(this, MissingTenantError.prototype);
  }
}
