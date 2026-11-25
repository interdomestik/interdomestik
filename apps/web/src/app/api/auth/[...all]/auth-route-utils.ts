import { enforceRateLimit } from '@/lib/rate-limit';
import { enforceOtpRateLimits } from '@/lib/rate-limit-otp';
import { resolvePublicAdmission } from '@/lib/tenant/public-admission-tenant';
import type { TenantId } from '@/lib/tenant/tenant-hosts';

import { getAuthRateLimitConfig } from './_core';
import {
  evaluateNeutralOtpHost,
  evaluateNeutralOtpOrigin,
  neutralOtpPathKind,
  otpUnavailable,
} from './neutral-otp-boundary';
import { refuseNeutralOtpAccount } from './neutral-otp-response';

type NeutralOtpPreflight = { body: unknown; tenantId: TenantId } | { response: Response };

export function shouldBypassAuthRateLimit(headers: Headers): boolean {
  const host = (headers.get('x-forwarded-host') ?? headers.get('host') ?? '').toLowerCase();
  const hostname = host.split(':')[0];
  const loopback =
    hostname === '127.0.0.1' || hostname === 'localhost' || hostname.endsWith('.127.0.0.1.nip.io');
  return process.env.NODE_ENV !== 'production' && loopback;
}

export async function parseAuthJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.clone().json();
  } catch {
    return null;
  }
}

export function enforcePostAuthRateLimit(request: Request) {
  return enforceRateLimit({
    ...getAuthRateLimitConfig('POST', request.url),
    headers: request.headers,
    productionSensitive: true,
  });
}

export async function prepareNeutralOtpRequest(
  request: Request
): Promise<NeutralOtpPreflight | null> {
  const kind = neutralOtpPathKind(request.url);
  if (!kind) return null;
  if (!evaluateNeutralOtpHost(request.headers)) return { response: otpUnavailable() };
  if (!evaluateNeutralOtpOrigin(request)) return { response: otpUnavailable(403) };
  const admission = resolvePublicAdmission(request.headers);
  if (admission?.kind !== 'door') {
    return { response: refuseNeutralOtpAccount(kind) };
  }
  const limited = await enforceOtpRateLimits({
    kind,
    headers: request.headers,
    dimensions: ['ip'],
  });
  if (limited) return { response: limited };
  return { body: await parseAuthJsonBody(request), tenantId: admission.tenantId };
}
