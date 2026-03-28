import { logAuditEvent } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { coerceTenantId } from '@/lib/tenant/tenant-hosts';
import { enforceRateLimit } from '@/lib/rate-limit';
import { toNextJsHandler } from 'better-auth/next-js';

import {
  evaluateEmailSignInTenantGuard,
  getAuthRateLimitConfig,
  getAuthRateLimitKeySuffix,
  isEmailPasswordSignInUrl,
  getPasswordResetAuditEventFromUrl,
  resolveTenantIdForPasswordResetAudit,
} from './_core';

const handler = toNextJsHandler(auth);

function isLocalLoopbackAuthHost(headers: Headers): boolean {
  const host = (headers.get('x-forwarded-host') ?? headers.get('host') ?? '').toLowerCase();
  const hostname = host.split(':')[0];

  return (
    hostname === '127.0.0.1' || hostname === 'localhost' || hostname.endsWith('.127.0.0.1.nip.io')
  );
}

function shouldBypassAuthRateLimit(headers: Headers): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  return isLocalLoopbackAuthHost(headers);
}

export async function GET(req: Request) {
  if (!shouldBypassAuthRateLimit(req.headers)) {
    const limited = await enforceRateLimit({
      ...getAuthRateLimitConfig('GET', req.url),
      headers: req.headers,
      productionSensitive: true,
    });
    if (limited) return limited;
  }
  return handler.GET(req as unknown as Parameters<typeof handler.GET>[0]);
}

export async function POST(req: Request) {
  const emailPasswordSignIn = isEmailPasswordSignInUrl(req.url);

  if (!shouldBypassAuthRateLimit(req.headers)) {
    if (emailPasswordSignIn) {
      let signInBody: unknown = null;
      try {
        signInBody = await req.clone().json();
      } catch {
        signInBody = null;
      }

      const identityKeySuffix = getAuthRateLimitKeySuffix({
        method: 'POST',
        url: req.url,
        headers: req.headers,
        body: signInBody,
      });

      if (identityKeySuffix) {
        const identityLimited = await enforceRateLimit({
          name: 'api/auth/sign-in/email:identity',
          limit: 5,
          windowSeconds: 60,
          headers: req.headers,
          keySuffix: identityKeySuffix,
          productionSensitive: true,
        });
        if (identityLimited) return identityLimited;
      } else {
        const limited = await enforceRateLimit({
          ...getAuthRateLimitConfig('POST', req.url),
          headers: req.headers,
          productionSensitive: true,
        });
        if (limited) return limited;
      }
    } else {
      const limited = await enforceRateLimit({
        ...getAuthRateLimitConfig('POST', req.url),
        headers: req.headers,
        productionSensitive: true,
      });
      if (limited) return limited;
    }
  }

  if (emailPasswordSignIn) {
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
