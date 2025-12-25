import { auth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { enforceRateLimit } from '@/lib/rate-limit';
import { toNextJsHandler } from 'better-auth/next-js';

const handler = toNextJsHandler(auth);

export async function GET(req: Request) {
  const limited = await enforceRateLimit({
    name: 'api/auth',
    limit: 30,
    windowSeconds: 60,
    headers: req.headers,
  });
  if (limited) return limited;
  return handler.GET(req as unknown as Parameters<typeof handler.GET>[0]);
}

export async function POST(req: Request) {
  const limited = await enforceRateLimit({
    name: 'api/auth',
    limit: 15,
    windowSeconds: 60,
    headers: req.headers,
  });
  if (limited) return limited;

  // Record reset-password request intent for incident forensics (no PII).
  try {
    const pathname = new URL(req.url).pathname;
    if (pathname.endsWith('/api/auth/request-password-reset')) {
      await logAuditEvent({
        action: 'auth.password_reset_requested',
        entityType: 'auth',
        metadata: { route: '/api/auth/request-password-reset' },
        headers: req.headers,
      });
    }
  } catch {
    // Ignore URL parsing / audit failures
  }

  return handler.POST(req as unknown as Parameters<typeof handler.POST>[0]);
}
