import { parseOnboardingSelector } from '@/lib/auth/onboarding-authority';
import { releaseClass } from '@/lib/runtime-environment';

export type NeutralOtpKind = 'send' | 'verify';

const SEND_PATH = '/api/auth/email-otp/send-verification-otp';
const VERIFY_PATH = '/api/auth/sign-in/email-otp';
const FIXED_HOSTS = new Set(['ida.interdomestik.com', 'ida.localhost', 'ida.127.0.0.1.nip.io']);

function record(body: unknown): Record<string, unknown> | null {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function parseHostAuthority(
  raw: string | null | undefined
): { authority: string; hostname: string } | null {
  const value = raw?.trim();
  if (!value || /[,/@\\?#\s]/.test(value) || value.includes('://')) return null;
  const match = /^([a-z\d](?:[a-z\d.-]*[a-z\d])?\.?)(?::(\d{1,5}))?$/i.exec(value);
  if (!match) return null;
  const hostname = match[1]!.toLowerCase().replace(/\.$/, '');
  const port = match[2] ? Number(match[2]) : null;
  if (!hostname || (port !== null && (port < 1 || port > 65535))) return null;
  const portSuffix = port === null ? '' : `:${port}`;
  return { hostname, authority: hostname + portSuffix };
}

export function neutralOtpPathKind(url: string): NeutralOtpKind | null {
  if (!URL.canParse(url)) return null;
  const pathname = new URL(url).pathname;
  if (pathname === VERIFY_PATH) return 'verify';
  return pathname === SEND_PATH ? 'send' : null;
}

export function classifyNeutralOtpRequest(url: string, body: unknown): NeutralOtpKind | null {
  const kind = neutralOtpPathKind(url);
  return kind === 'send' && record(body)?.type !== 'sign-in' ? null : kind;
}

export function evaluateNeutralOtpHost(headers: Headers): boolean {
  const rawDirect = headers.get('host');
  const direct = parseHostAuthority(rawDirect);
  if (!direct) {
    return false;
  }
  const fixedHostAllowed =
    FIXED_HOSTS.has(direct.hostname) &&
    (direct.hostname !== 'ida.interdomestik.com' || direct.authority === direct.hostname);
  const stagingHostAllowed =
    rawDirect?.toLowerCase() === 'staging.interdomestik.com' && releaseClass() === 'staging';
  if (!fixedHostAllowed && !stagingHostAllowed) {
    return false;
  }
  const forwardedRaw = headers.get('x-forwarded-host');
  return !forwardedRaw || parseHostAuthority(forwardedRaw)?.authority === direct.authority;
}

export function evaluateNeutralOtpOrigin(request: Request): boolean {
  const rawOrigin = request.headers.get('origin')?.trim();
  if (!rawOrigin || rawOrigin === 'null') return false;
  try {
    const origin = new URL(rawOrigin);
    const requestUrl = new URL(request.url);
    const direct = parseHostAuthority(request.headers.get('host'));
    const rawForwardedProto = request.headers.get('x-forwarded-proto')?.trim().toLowerCase();
    if (rawForwardedProto && rawForwardedProto !== 'http' && rawForwardedProto !== 'https') {
      return false;
    }
    const publicProtocol = rawForwardedProto ? `${rawForwardedProto}:` : requestUrl.protocol;
    // Next's standalone server can expose its loopback bind authority in request.url while the
    // browser correctly targets the validated public Host and a TLS-terminating proxy reports the
    // public scheme. Compare those public values so an internal bind address cannot disable the
    // browser-origin guard. Ambiguous forwarded-proto chains fail closed above.
    if (origin.host !== direct?.authority || origin.protocol !== publicProtocol) {
      return false;
    }
  } catch {
    return false;
  }
  const fetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase();
  return !fetchSite || fetchSite === 'same-origin';
}

export function extractNeutralOtpEmail(body: unknown): string | null {
  const email = record(body)?.email;
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  return normalized || null;
}

export function hasValidNeutralVerifyHints(body: unknown, defaultTenantId: string): boolean {
  const parsed = parseOnboardingSelector(body);
  return (
    parsed.kind === 'valid' &&
    parsed.selector.tenant === defaultTenantId &&
    parsed.selector.mode === 'deferred'
  );
}

export function otpUnavailable(status = 400): Response {
  return Response.json({ code: 'OTP_UNAVAILABLE', message: 'Unable to verify' }, { status });
}
