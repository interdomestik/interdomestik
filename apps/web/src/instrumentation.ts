import * as Sentry from '@sentry/nextjs';

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    import('./sentry.server.config');

    // Hardening: Prevent process crash on client disconnects during E2E/Load tests
    process.on('uncaughtException', (err: unknown) => {
      const error = err as { code?: string; message?: string };
      if (
        error?.code === 'ECONNRESET' ||
        error?.message === 'aborted' ||
        error?.message?.includes?.('EPIPE')
      ) {
        // Ignore client disconnects
        return;
      }
      console.error('Uncaught Exception:', err);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason: unknown) => {
      const error = reason as { code?: string; message?: string };
      if (error?.code === 'ECONNRESET' || error?.message === 'aborted') return;
      console.error('Unhandled Rejection:', reason);
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
