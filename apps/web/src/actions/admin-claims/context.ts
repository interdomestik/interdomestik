import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export async function getActionContext() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  return { session, requestHeaders };
}
