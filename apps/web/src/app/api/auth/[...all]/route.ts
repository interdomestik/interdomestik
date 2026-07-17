import { logAuditEvent } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { lookupUserTenantByEmail } from '@/lib/auth/tenant-lookup';
import { enforceRateLimit } from '@/lib/rate-limit';
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
          const route = new URL(req.url).pathname;
          await logAuditEvent({
            action: 'auth.signin_denied_wrong_tenant',
            entityType: 'auth',
            tenantId: tenantGuard.resolvedTenantId,
            metadata: { route, reason: tenantGuard.reason },
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
