import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function getAgentSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.role !== 'agent') {
    return null;
  }

  return session;
}
