import { logAuditEvent } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { coerceTenantId } from '@/lib/tenant/tenant-hosts';
import { enforceRateLimit } from '@/lib/rate-limit';
import { toNextJsHandler } from 'better-auth/next-js';

import {
  evaluateEmailSignInTenantGuard,
  getAuthRateLimitConfig,
  isEmailPasswordSignInUrl,
  getPasswordResetAuditEventFromUrl,
  resolveTenantIdForPasswordResetAudit,
} from './_core';

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

  if (isEmailPasswordSignInUrl(req.url)) {
    let signInBody: unknown = null;
    try {
      signInBody = await req.clone().json();
    } catch {
      signInBody = null;
    }

    const tenantGuard = await evaluateEmailSignInTenantGuard({
      url: req.url,
      headers: req.headers,
      body: signInBody,
      lookupUserTenantByEmail: async email => {
        const [{ db }, { user: userTable }, drizzle] = await Promise.all([
          import('@interdomestik/database/db'),
          import('@interdomestik/database/schema'),
          import('drizzle-orm'),
        ]);
        const rows = await db
          .select({ tenantId: userTable.tenantId })
          .from(userTable)
          .where(drizzle.eq(userTable.email, email))
          .limit(1);
        return coerceTenantId(rows[0]?.tenantId ?? undefined);
      },
    });

    if (tenantGuard?.decision === 'deny') {
      if (tenantGuard.reason === 'tenant_mismatch') {
        try {
          await logAuditEvent({
            action: 'auth.signin_denied_wrong_tenant',
            entityType: 'auth',
            tenantId: tenantGuard.resolvedTenantId,
            metadata: { route: '/api/auth/sign-in/email', reason: tenantGuard.reason },
            headers: req.headers,
          });
        } catch {
          // Ignore audit failures
        }
      }

      return Response.json(
        { code: tenantGuard.code, message: tenantGuard.message },
        { status: 401 }
      );
    }
  }

  const audit = getPasswordResetAuditEventFromUrl(req.url);
  if (audit) {
    try {
      const tenantId = resolveTenantIdForPasswordResetAudit(req.url, req.headers);
      await logAuditEvent({
        action: audit.action,
        entityType: audit.entityType,
        tenantId,
        metadata: audit.metadata,
        headers: req.headers,
      });
    } catch {
      // Ignore audit failures
    }
  }

  return handler.POST(req as unknown as Parameters<typeof handler.POST>[0]);
}
