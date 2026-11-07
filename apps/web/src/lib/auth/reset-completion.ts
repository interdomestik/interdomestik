import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';

/**
 * ACQ-2c: after Better Auth completed a password reset (token consumed, password written, sessions
 * revoked), the mailbox the link was mailed to counts as proven. Failed, invalid, expired or
 * replayed resets never reach this point with a successful result. A verification failure never
 * changes the completed reset; it is logged without content.
 */
export function resetCompletionPlugin(): BetterAuthPlugin {
  return {
    id: 'ida-reset-completion',
    hooks: {
      after: [
        {
          matcher: ctx => ctx.path === '/reset-password',
          handler: createAuthMiddleware(async ctx => {
            const returned = ctx.context.returned as { status?: unknown } | undefined;
            if (returned?.status !== true || returned instanceof Error) return;
            const token: unknown = ctx.body?.token || ctx.query?.token;
            if (typeof token !== 'string' || token.length === 0) return;
            try {
              const { verifyResetMailbox } = await import('./different-email-recovery-store');
              await verifyResetMailbox(token);
            } catch {
              console.error('[auth][reset] mailbox_verification_failed');
            }
          }),
        },
      ],
    },
  };
}
