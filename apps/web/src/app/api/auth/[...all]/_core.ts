export type AuthMethod = 'GET' | 'POST';

export function getAuthRateLimitConfig(method: AuthMethod): {
  name: string;
  limit: number;
  windowSeconds: number;
} {
  switch (method) {
    case 'GET':
      return { name: 'api/auth', limit: 10, windowSeconds: 60 };
    case 'POST':
      return { name: 'api/auth', limit: 5, windowSeconds: 60 };
  }
}

export type PasswordResetAuditEvent = {
  action: 'auth.password_reset_requested';
  entityType: 'auth';
  metadata: { route: '/api/auth/request-password-reset' };
};

export function getPasswordResetAuditEventFromUrl(url: string): PasswordResetAuditEvent | null {
  try {
    const pathname = new URL(url).pathname;

    // Record reset-password request intent for incident forensics (no PII).
    if (pathname.endsWith('/api/auth/request-password-reset')) {
      return {
        action: 'auth.password_reset_requested',
        entityType: 'auth',
        metadata: { route: '/api/auth/request-password-reset' },
      };
    }

    return null;
  } catch {
    return null;
  }
}
