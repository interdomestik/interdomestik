import { extractRequestMetadata } from '@/lib/audit.core';
import { auth } from '@/lib/auth';
import { lookupUserTenantByEmail } from '@/lib/auth/tenant-lookup';
import { enforceRateLimit } from '@/lib/rate-limit';
import { appendAnonymousTenantAuditEvent } from '@interdomestik/database';
import { toNextJsHandler } from 'better-auth/next-js';
import {
  enforcePostAuthRateLimit,
  parseAuthJsonBody,
  prepareNeutralOtpRequest,
  shouldBypassAuthRateLimit,
} from './auth-route-utils';
import { classifyNeutralOtpRequest, otpUnavailable } from './neutral-otp-boundary';
import { handleNeutralOtpPost } from './neutral-otp-route';
import {
  evaluateEmailSignInTenantGuard,
  getAuthRateLimitConfig,
  getAuthRateLimitKeySuffix,
  isEmailSignInUrl,
  getPasswordResetAuditEventFromUrl,
  resolveTenantIdForPasswordResetAudit,
} from './_core';
import { evaluateEmailSignUpTenantGuard, isEmailSignUpUrl } from './sign-up-tenant-guard';

// Anonymous request headers are attacker-controlled: bound them so an oversized value cannot push
// a security event past the audit append's 2 KiB metadata cap and suppress it. Only printable ASCII
// is kept, so each kept character serializes to at most two JSON bytes (2 × (64 + 512) plus the
// fixed route and reason labels stays under the cap).
function boundedHeaderValue(value: string | null | undefined, maxChars: number) {
  return value?.replace(/[^\x20-\x7e]/g, '?').slice(0, maxChars);
}

function anonymousRequestMetadata(headers: Headers): { ip?: string; userAgent?: string } {
  const { ip, userAgent } = extractRequestMetadata(headers);
  return { ip: boundedHeaderValue(ip, 64), userAgent: boundedHeaderValue(userAgent, 512) };
}

const handler = toNextJsHandler(auth);
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
  const neutral = await prepareNeutralOtpRequest(req);
  if (neutral && 'response' in neutral) return neutral.response;
  if (neutral) {
    const neutralOtp = classifyNeutralOtpRequest(req.url, neutral.body);
    if (!neutralOtp) return otpUnavailable();
    return handleNeutralOtpPost({
      request: req,
      body: neutral.body,
      kind: neutralOtp,
      handler: request => handler.POST(request as unknown as Parameters<typeof handler.POST>[0]),
    });
  }
  const emailSignIn = isEmailSignInUrl(req.url);
  const emailSignUp = isEmailSignUpUrl(req.url);
  const authBody = emailSignIn || emailSignUp ? await parseAuthJsonBody(req) : null;
  const postRateLimitConfig = getAuthRateLimitConfig('POST', req.url);

  if (!shouldBypassAuthRateLimit(req.headers)) {
    if (emailSignIn) {
      const identityKeySuffix = getAuthRateLimitKeySuffix({
        method: 'POST',
        url: req.url,
        headers: req.headers,
        body: authBody,
      });

      if (identityKeySuffix) {
        const identityLimited = await enforceRateLimit({
          name: `${postRateLimitConfig.name}:identity`,
          limit: 20,
          windowSeconds: postRateLimitConfig.windowSeconds,
          headers: req.headers,
          keySuffix: identityKeySuffix,
          productionSensitive: true,
        });
        if (identityLimited) return identityLimited;
      } else {
        const limited = await enforcePostAuthRateLimit(req);
        if (limited) return limited;
      }
    } else {
      const limited = await enforcePostAuthRateLimit(req);
      if (limited) return limited;
    }
  }

  if (emailSignIn) {
    const tenantGuard = await evaluateEmailSignInTenantGuard({
      url: req.url,
      headers: req.headers,
      body: authBody,
      lookupUserTenantByEmail,
    });

    if (tenantGuard?.decision === 'deny') {
      if (tenantGuard.reason === 'tenant_mismatch') {
        try {
          if (tenantGuard.resolvedTenantId) {
            await appendAnonymousTenantAuditEvent({
              action: 'auth.signin_denied_wrong_tenant',
              entityType: 'auth',
              tenantId: tenantGuard.resolvedTenantId,
              metadata: {
                // A fixed label: the request path is attacker-controlled (any prefix ending in the
                // sign-in suffix reaches this branch) and could push the event past the cap.
                route: '/api/auth/sign-in/email',
                reason: tenantGuard.reason,
                ...anonymousRequestMetadata(req.headers),
              },
            });
          }
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

  if (emailSignUp) {
    const tenantGuard = evaluateEmailSignUpTenantGuard({
      url: req.url,
      headers: req.headers,
      body: authBody,
    });
    if (tenantGuard?.decision === 'deny') {
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
      if (tenantId) {
        await appendAnonymousTenantAuditEvent({
          action: audit.action,
          entityType: 'auth',
          tenantId,
          metadata: { ...audit.metadata, ...anonymousRequestMetadata(req.headers) },
        });
      }
    } catch {
      // Ignore audit failures
    }
  }

  return handler.POST(req as unknown as Parameters<typeof handler.POST>[0]);
}
