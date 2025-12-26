import { logAuditEvent } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { toNextJsHandler } from 'better-auth/next-js';

import { getAuthRateLimitConfig, getPasswordResetAuditEventFromUrl } from './_core';

const handler = toNextJsHandler(auth);

export async function GET(req: Request) {
  const limited = await enforceRateLimit({
    ...getAuthRateLimitConfig('GET'),
    headers: req.headers,
  });
  if (limited) return limited;
  return handler.GET(req as unknown as Parameters<typeof handler.GET>[0]);
}

export async function POST(req: Request) {
  const limited = await enforceRateLimit({
    ...getAuthRateLimitConfig('POST'),
    headers: req.headers,
  });
  if (limited) return limited;

  const audit = getPasswordResetAuditEventFromUrl(req.url);
  if (audit) {
    try {
      await logAuditEvent({
        action: audit.action,
        entityType: audit.entityType,
        metadata: audit.metadata,
        headers: req.headers,
      });
    } catch {
      // Ignore audit failures
    }
  }

  return handler.POST(req as unknown as Parameters<typeof handler.POST>[0]);
}
