import { getCachedSession } from '../../lib/auth.server';
import { cache } from 'react';

export async function resolveMemberPortalContextInner() {
  const session = await getCachedSession();
  const userId = session?.user?.id;

  if (!session || !userId) return null;

  return {
    session,
    userId,
    tenantId: session.user.tenantId ?? null,
  };
}

export const getMemberPortalContext = cache(resolveMemberPortalContextInner);
