import { auth } from '@/lib/auth';
import { recordValue } from '@/lib/auth/authority-fields';
import { lookupNeutralOtpAccountByEmail } from '@/lib/auth/tenant-lookup';
import { enforceOtpRateLimits } from '@/lib/rate-limit-otp';
import { resolvePublicAdmissionTenant } from '@/lib/tenant/public-admission-tenant';
import { isPublicIntakeOpenForTenant } from '@/lib/tenant/public-intake-admission';
import { coerceTenantId, resolveDefaultPublicTenantId } from '@/lib/tenant/tenant-hosts';

import {
  evaluateNeutralOtpHost,
  extractNeutralOtpEmail,
  hasValidNeutralVerifyHints,
  otpUnavailable,
  type NeutralOtpKind,
} from './neutral-otp-boundary';
import { accountStop, refuseNeutralOtpAccount } from './neutral-otp-response';
import { protectNeutralOtpSession } from './neutral-otp-session';

type PostHandler = (request: Request) => Promise<Response>;

function sanitizedRequest(args: {
  request: Request;
  body: unknown;
  email: string;
  kind: NeutralOtpKind;
  tenantId: string;
}): Request {
  const otp = recordValue(args.body)?.otp;
  const body =
    args.kind === 'send'
      ? { email: args.email, type: 'sign-in' }
      : {
          email: args.email,
          otp: typeof otp === 'string' ? otp : undefined,
          onboarding: { tenant: args.tenantId, mode: 'deferred' },
        };
  const headers = new Headers(args.request.headers);
  headers.set('content-type', 'application/json');
  headers.delete('content-length');
  return new Request(args.request.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: args.request.signal,
  });
}

function contentFreeSessionLog(category: string): void {
  if (process.env.OTP_CONTENT_FREE_LOGGING === '1') {
    console.error(`[auth][email-otp] ${category}`);
  }
}

async function parseVerifyData(response: Response): Promise<{
  token?: unknown;
  user?: { id?: unknown; tenantId?: unknown } | null;
} | null> {
  try {
    const data = recordValue(await response.clone().json());
    return data && { token: data.token, user: recordValue(data.user) };
  } catch {
    return null;
  }
}

export async function handleNeutralOtpPost(args: {
  request: Request;
  body: unknown;
  kind: NeutralOtpKind;
  handler: PostHandler;
}): Promise<Response> {
  const { request, body, kind, handler } = args;
  if (!evaluateNeutralOtpHost(request.headers)) return otpUnavailable();
  const admissionTenant = resolvePublicAdmissionTenant(request.headers);
  const tenantId = resolveDefaultPublicTenantId();
  if (
    admissionTenant !== tenantId ||
    coerceTenantId(process.env.DEFAULT_PUBLIC_TENANT_ID) !== tenantId
  ) {
    return refuseNeutralOtpAccount(kind);
  }
  const email = extractNeutralOtpEmail(body);
  if (!email) return otpUnavailable();
  const otp = recordValue(body)?.otp;
  if (kind === 'verify' && (typeof otp !== 'string' || !otp.trim())) return otpUnavailable();

  if (kind === 'verify' && !hasValidNeutralVerifyHints(body, tenantId)) {
    return otpUnavailable();
  }
  const limited = await enforceOtpRateLimits({
    kind,
    tenantId,
    email,
    secret: process.env.OTP_RATE_LIMIT_HMAC_SECRET ?? '',
    headers: request.headers,
    dimensions: ['identity'],
  });
  if (limited) return limited;

  const account = await lookupNeutralOtpAccountByEmail(email);
  const eligible = account
    ? account.tenantId === admissionTenant && account.tenantClassificationPending === true
    : await isPublicIntakeOpenForTenant(admissionTenant);
  if (!eligible) return refuseNeutralOtpAccount(kind);

  const response = await handler(sanitizedRequest({ request, body, email, kind, tenantId }));
  if (kind === 'send' || !response.ok) return response;
  const guarded = await protectNeutralOtpSession({
    auth,
    verifyData: await parseVerifyData(response),
    responseHeaders: response.headers,
    resolveDefaultTenantId: () => tenantId,
    log: contentFreeSessionLog,
  });
  return guarded.decision === 'continue' ? response : accountStop(guarded.headers);
}
