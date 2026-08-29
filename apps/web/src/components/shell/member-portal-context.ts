import 'server-only';

import { cache } from 'react';

import { getCachedSession } from '../../lib/auth.server';

async function resolvePortalContext() {
  const session = await getCachedSession();
  const user = session?.user;
  if (!user?.id || !user.tenantId) return null;

  return { userId: user.id, tenantId: user.tenantId };
}

export const getMemberPortalContext = cache(resolvePortalContext);
