import { extractRequestMetadata } from '@/lib/audit.core';
import { auth } from '@/lib/auth';
import { lookupUserTenantByEmail } from '@/lib/auth/tenant-lookup';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolvePublicAdmissionTenant } from '@/lib/tenant/public-admission-tenant';
import { isPublicIntakeOpenForTenant } from '@/lib/tenant/public-intake-admission';
import { appendAnonymousTenantAuditEvent } from '@interdomestik/database';
import { toNextJsHandler } from 'better-auth/next-js';
import { after } from 'next/server';
import {
  enforcePostAuthRateLimit,
  parseAuthJsonBody,
  prepareNeutralOtpRequest,
  shouldBypassAuthRateLimit,
} from './auth-route-utils';
import { classifyNeutralOtpRequest, otpUnavailable } from './neutral-otp-boundary';
import { handleNeutralOtpPost } from './neutral-otp-route';
import { evaluatePasswordResetTarget, passwordResetTargetOrigins } from './password-reset-target';
import {
  evaluateEmailSignInTenantGuard,
  extractEmailFromSignInBody,
  getAuthRateLimitConfig,
  getAuthRateLimitKeySuffix,
  isEmailSignInUrl,
  getPasswordResetAuditEventFromUrl,
  resolveTenantIdForPasswordResetAudit,
} from './_core';
import {
  evaluateEmailSignUpTenantGuard,
  isEmailSignUpUrl,
  refuseEmailSignUp,
} from './sign-up-tenant-guard';

// Anonymous request headers are attacker-controlled: bound them so an oversized value cannot push
// a security event past the audit append's 2 KiB metadata cap and suppress it. Only printable ASCII
// is kept, so each kept character serializes to at most two JSON bytes (2 × (64 + 512 + 256), with
// the reset target bounded the same way, plus the fixed route and reason labels stays under the cap).
function boundedHeaderValue(value: string | null | undefined, maxChars: number) {
  return value?.replace(/[^\x20-\x7e]/g, '?').slice(0, maxChars);
}

function anonymousRequestMetadata(headers: Headers): { ip?: string; userAgent?: string } {
  const { ip, userAgent } = extractRequestMetadata(headers);
  return { ip: boundedHeaderValue(ip, 64), userAgent: boundedHeaderValue(userAgent, 512) };
}

type ResetAuditEvent = Omit<Parameters<typeof appendAnonymousTenantAuditEvent>[0], 'tenantId'>;

// A reset requested on the one door carries no tenant context; the account's own tenant records
// it (SEC-11). The lookup and the append run after the response, so the response time does not
// tell whether the address has an account.
function recordResetForAccountTenant(email: string | null, event: ResetAuditEvent): void {
  if (!email) return;
  after(async () => {
    try {
      const tenantId = await lookupUserTenantByEmail(email);
      if (tenantId) await appendAnonymousTenantAuditEvent({ ...event, tenantId });
    } catch {
      // Ignore audit failures
    }
  });
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
  let admissionTenant: ReturnType<typeof resolvePublicAdmissionTenant> = null;
  if (emailSignUp) {
    admissionTenant = resolvePublicAdmissionTenant(req.headers);
  }
  if (emailSignUp && !admissionTenant) {
    return refuseEmailSignUp();
  }
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

  if (admissionTenant) {
    const tenantGuard = evaluateEmailSignUpTenantGuard({
      url: req.url,
      headers: req.headers,
      body: authBody,
      admissionTenant,
    });
    if (tenantGuard?.decision === 'deny' || !(await isPublicIntakeOpenForTenant(admissionTenant))) {
      return refuseEmailSignUp();
    }
  }
  const audit = getPasswordResetAuditEventFromUrl(req.url);
  if (audit) {
    const resetBody = await parseAuthJsonBody(req);
    const resetTarget = evaluatePasswordResetTarget(
      resetBody,
      passwordResetTargetOrigins(req.url, req.headers)
    );
    if (!resetTarget.allowed) {
      return Response.json(
        { code: 'INVALID_REDIRECT', message: 'Invalid redirect target' },
        { status: 400 }
      );
    }
    const event = {
      action: audit.action,
      entityType: 'auth' as const,
      metadata: {
        ...audit.metadata,
        redirectTarget: resetTarget.target,
        ...anonymousRequestMetadata(req.headers),
      },
    };
    try {
      const tenantId = resolveTenantIdForPasswordResetAudit(req.url, req.headers);
      if (tenantId) {
        await appendAnonymousTenantAuditEvent({ ...event, tenantId });
      } else {
        recordResetForAccountTenant(extractEmailFromSignInBody(resetBody), event);
      }
    } catch {
      // Ignore audit failures
    }
  }

  return handler.POST(req as unknown as Parameters<typeof handler.POST>[0]);
}
