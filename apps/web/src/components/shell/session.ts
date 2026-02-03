import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function getSessionSafe(logTag: string) {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session ?? null;
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
