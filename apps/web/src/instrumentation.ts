import * as Sentry from '@sentry/nextjs';

import { assertRenderingBuildMode } from './lib/rendering-build-mode';

export function register() {
  try {
    assertRenderingBuildMode(
      process.env.INTERDOMESTIK_BUILT_CSP_NONCE_MODE,
      process.env.CSP_NONCE_MODE
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid rendering build mode.');
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      process.exit(1);
    }
    throw error;
  }

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
