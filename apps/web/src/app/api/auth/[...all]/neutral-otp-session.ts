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

type RevokeSession = (args: { body: { token: string }; headers: Headers }) => Promise<unknown>;

async function revokeNewSession(args: {
  revokeSession: RevokeSession;
  token: string;
  headers: Headers;
  log?: (category: string) => void;
}): Promise<void> {
  try {
    await args.revokeSession({ body: { token: args.token }, headers: args.headers });
  } catch {
    try {
      args.log?.('otp_session_revoke_failed');
    } catch {
      // Content-free telemetry must never change the fail-closed response.
    }
  }
}

// A session for another account than the one the door admitted is an invalid code, not an account stop.
function stopDecision(accountMismatch: boolean): 'invalidOtp' | 'accountStop' {
  if (accountMismatch) {
    return 'invalidOtp';
  }
  return 'accountStop';
}

export async function protectNeutralOtpSession(args: {
  getSession: (args: {
    headers: Headers;
    query: { disableCookieCache: true; disableRefresh: true };
  }) => Promise<FreshSession>;
  revokeSession: RevokeSession;
  admittedAccountId: string;
  verifyData: VerifyData;
  responseHeaders: Headers;
  resolveDefaultTenantId: () => string;
  log?: (category: string) => void;
}): Promise<{ decision: 'continue' | 'accountStop' | 'invalidOtp'; headers: Headers }> {
  const {
    getSession,
    revokeSession,
    admittedAccountId,
    verifyData,
    responseHeaders,
    resolveDefaultTenantId,
    log,
  } = args;
  const token = typeof verifyData?.token === 'string' ? verifyData.token : null;
  const userId = typeof verifyData?.user?.id === 'string' ? verifyData.user.id : null;
  const cookie = cookieHeaderFromSetCookie(responseHeaders);
  if (!token || !userId || !cookie) {
    return { decision: 'accountStop', headers: accountStop(responseHeaders).headers };
  }

  const headers = new Headers({ cookie });
  const responseAccountMismatch = userId !== admittedAccountId;
  if (responseAccountMismatch || verifyData?.user?.tenantId !== resolveDefaultTenantId()) {
    await revokeNewSession({ revokeSession, token, headers, log });
    return {
      decision: stopDecision(responseAccountMismatch),
      headers: accountStop(responseHeaders).headers,
    };
  }

  let fresh: FreshSession;
  try {
    fresh = await getSession({
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
  const sessionUserId = fresh?.session?.userId;
  const authoritative =
    sessionUserId === userId &&
    fresh?.user?.id === userId &&
    fresh?.user?.tenantId === resolveDefaultTenantId() &&
    fresh?.user?.tenantClassificationPending === true;
  if (authoritative) return { decision: 'continue', headers: new Headers(responseHeaders) };
  const sessionAccountMismatch =
    typeof sessionUserId === 'string' && sessionUserId !== admittedAccountId;
  await revokeNewSession({ revokeSession, token, headers, log });
  return {
    decision: stopDecision(sessionAccountMismatch),
    headers: accountStop(responseHeaders).headers,
  };
}
