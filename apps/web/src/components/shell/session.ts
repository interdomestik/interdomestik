import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>> | null;

const SESSION_CACHE_TTL_MS = 2000;
const successfulSessionCache = new Map<string, { expiresAt: number; session: SessionResult }>();
const inFlightSessionCache = new Map<string, Promise<SessionResult>>();

function getRequestSignature(requestHeaders: Headers): string {
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? '';
  const cookie = requestHeaders.get('cookie') ?? '';
  const authorization = requestHeaders.get('authorization') ?? '';
  return `${host}::${cookie}::${authorization}`;
}

async function fetchSessionOnce(logTag: string, requestHeaders: Headers): Promise<SessionResult> {
  try {
    return (await auth.api.getSession({ headers: requestHeaders })) ?? null;
  } catch (error) {
    console.error(`[${logTag}] Session fetch failed:`, error);
    return null;
  }
}

async function fetchSessionWithRetry(
  logTag: string,
  requestHeaders: Headers
): Promise<SessionResult> {
  const firstAttempt = await fetchSessionOnce(logTag, requestHeaders);
  if (firstAttempt) return firstAttempt;

  await new Promise(resolve => setTimeout(resolve, 100));
  return await fetchSessionOnce(logTag, requestHeaders);
}

export async function getSessionSafe(logTag: string) {
  try {
    const requestHeaders = await headers();
    const cacheKey = getRequestSignature(requestHeaders);
    const cached = successfulSessionCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.session;
    }

    const inFlight = inFlightSessionCache.get(cacheKey);
    if (inFlight) {
      return await inFlight;
    }

    const promise = fetchSessionWithRetry(logTag, requestHeaders).then(session => {
      inFlightSessionCache.delete(cacheKey);
      if (session) {
        successfulSessionCache.set(cacheKey, {
          expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
          session,
        });
      } else {
        successfulSessionCache.delete(cacheKey);
      }
      return session;
    });

    inFlightSessionCache.set(cacheKey, promise);
    return await promise;
  } catch (err) {
    console.error(`[${logTag}] Session fetch failed:`, err);
    return null;
  }
}

export function requireSessionOrRedirect<TSession>(
  session: TSession | null,
  locale: string
): NonNullable<TSession> {
  if (!session) {
    redirect(`/${locale}/login`);
  }

  return session as NonNullable<TSession>;
}
