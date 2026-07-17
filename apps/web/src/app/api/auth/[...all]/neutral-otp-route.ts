import { auth } from '@/lib/auth';
import { enforceOtpRateLimits } from '@/lib/rate-limit-otp';
import { resolveDefaultPublicTenantId } from '@/lib/tenant/tenant-hosts';

import {
  evaluateNeutralOtpHost,
  extractNeutralOtpEmail,
  hasValidNeutralVerifyHints,
  otpUnavailable,
  type NeutralOtpKind,
} from './neutral-otp-boundary';
import { accountStop } from './neutral-otp-response';
import { protectNeutralOtpSession } from './neutral-otp-session';

type PostHandler = (request: Request) => Promise<Response>;

function sanitizedRequest(args: {
  request: Request;
  body: unknown;
  email: string;
  kind: NeutralOtpKind;
  tenantId: string;
}): Request {
  const value = args.body as Record<string, unknown>;
  const body =
    args.kind === 'send'
      ? { email: args.email, type: 'sign-in' }
      : {
          email: args.email,
          otp: typeof value.otp === 'string' ? value.otp : undefined,
          tenantId: args.tenantId,
          tenantClassificationPending: true,
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
    return (await response.clone().json()) as {
      token?: unknown;
      user?: { id?: unknown; tenantId?: unknown } | null;
    };
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
  const email = extractNeutralOtpEmail(body);
  if (!email) return otpUnavailable();
  const otp = body && typeof body === 'object' ? (body as Record<string, unknown>).otp : null;
  if (kind === 'verify' && (typeof otp !== 'string' || !otp.trim())) return otpUnavailable();

  const tenantId = resolveDefaultPublicTenantId();
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

  const response = await handler(sanitizedRequest({ request, body, email, kind, tenantId }));
  if (kind === 'send' || !response.ok) return response;
  const guarded = await protectNeutralOtpSession({
    auth,
    verifyData: await parseVerifyData(response),
    responseHeaders: response.headers,
    resolveDefaultTenantId: resolveDefaultPublicTenantId,
    log: contentFreeSessionLog,
  });
  return guarded.decision === 'continue' ? response : accountStop(guarded.headers);
}
