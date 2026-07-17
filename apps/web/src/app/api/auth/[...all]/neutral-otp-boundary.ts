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

function parseConfiguredAuthority(raw: string | undefined) {
  const value = raw?.trim();
  if (!value) return null;
  if (!value.includes('://')) return parseHostAuthority(value);
  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return parseHostAuthority(url.host);
  } catch {
    return null;
  }
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

export function evaluateNeutralOtpHost(headers: Headers, env?: { IDA_HOST?: string }): boolean {
  const direct = parseHostAuthority(headers.get('host'));
  const configured = parseConfiguredAuthority(env ? env.IDA_HOST : process.env.IDA_HOST);
  const fixedHostAllowed =
    direct?.hostname === 'ida.interdomestik.com'
      ? direct.authority === 'ida.interdomestik.com'
      : direct !== null && FIXED_HOSTS.has(direct.hostname);
  const configuredHostAllowed =
    direct?.hostname !== 'ida.interdomestik.com' && direct?.authority === configured?.authority;
  const allowed = direct !== null && (fixedHostAllowed || configuredHostAllowed);
  if (!allowed) return false;
  const forwardedRaw = headers.get('x-forwarded-host');
  return !forwardedRaw || parseHostAuthority(forwardedRaw)?.authority === direct.authority;
}

export function extractNeutralOtpEmail(body: unknown): string | null {
  const email = record(body)?.email;
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  return normalized || null;
}

export function hasValidNeutralVerifyHints(body: unknown, defaultTenantId: string): boolean {
  const value = record(body);
  return value?.tenantId === defaultTenantId && value.tenantClassificationPending === true;
}

export function otpUnavailable(status = 400): Response {
  return Response.json({ code: 'OTP_UNAVAILABLE', message: 'Unable to verify' }, { status });
}
