import { accountStop, cookieHeaderFromSetCookie } from './neutral-otp-response';

type VerifyData = {
  token?: unknown;
  user?: { id?: unknown; tenantId?: unknown } | null;
} | null;

type FreshSession = {
  session?: { userId?: unknown } | null;
  user?: {
    id?: unknown;
    tenantId?: unknown;
    tenantClassificationPending?: unknown;
  } | null;
} | null;

type NeutralOtpAuth = {
  api: {
    getSession: (args: {
      headers: Headers;
      query: { disableCookieCache: true; disableRefresh: true };
    }) => Promise<FreshSession>;
    revokeSession: (args: { body: { token: string }; headers: Headers }) => Promise<unknown>;
  };
};

async function revokeNewSession(args: {
  auth: NeutralOtpAuth;
  token: string;
  headers: Headers;
  log?: (category: string) => void;
}): Promise<void> {
  try {
    await args.auth.api.revokeSession({ body: { token: args.token }, headers: args.headers });
  } catch {
    try {
      args.log?.('otp_session_revoke_failed');
    } catch {
      // Content-free telemetry must never change the fail-closed response.
    }
  }
}

export async function protectNeutralOtpSession(args: {
  auth: NeutralOtpAuth;
  verifyData: VerifyData;
  responseHeaders: Headers;
  resolveDefaultTenantId: () => string;
  log?: (category: string) => void;
}): Promise<{ decision: 'continue' | 'accountStop'; headers: Headers }> {
  const { auth, verifyData, responseHeaders, resolveDefaultTenantId, log } = args;
  const token = typeof verifyData?.token === 'string' ? verifyData.token : null;
  const userId = typeof verifyData?.user?.id === 'string' ? verifyData.user.id : null;
  const cookie = cookieHeaderFromSetCookie(responseHeaders);
  if (!token || !userId || !cookie) {
    return { decision: 'accountStop', headers: accountStop(responseHeaders).headers };
  }

  const headers = new Headers({ cookie });
  if (verifyData?.user?.tenantId !== resolveDefaultTenantId()) {
    await revokeNewSession({ auth, token, headers, log });
    return { decision: 'accountStop', headers: accountStop(responseHeaders).headers };
  }

  let fresh: FreshSession;
  try {
    fresh = await auth.api.getSession({
      headers,
      query: { disableCookieCache: true, disableRefresh: true },
    });
  } catch {
    try {
      log?.('otp_fresh_session_failed');
    } catch {
      // Content-free telemetry must never change the fail-closed response.
    }
    fresh = null;
  }
  const authoritative =
    fresh?.session?.userId === userId &&
    fresh?.user?.id === userId &&
    fresh?.user?.tenantId === resolveDefaultTenantId() &&
    fresh?.user?.tenantClassificationPending === true;
  if (authoritative) return { decision: 'continue', headers: new Headers(responseHeaders) };
  await revokeNewSession({ auth, token, headers, log });
  return { decision: 'accountStop', headers: accountStop(responseHeaders).headers };
}
