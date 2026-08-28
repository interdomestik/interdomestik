import { cache } from 'react';

import { getCachedSession } from '../../lib/auth.server';

export async function resolveMemberPortalContextInner() {
  const session = await getCachedSession();
  if (!session?.user?.id) return null;

  return {
    session,
    userId: session.user.id,
    tenantId: session.user.tenantId ?? null,
  };
}

export const getMemberPortalContext = cache(resolveMemberPortalContextInner);
