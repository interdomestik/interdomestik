import 'server-only';

import { cache } from 'react';

import { getCachedSession } from '../../lib/auth.server';

async function resolvePortalContext() {
  const session = await getCachedSession();
  const user = session?.user;
  if (!user?.id) return null;

  return { session, userId: user.id, tenantId: user.tenantId ?? null };
}

export const getMemberPortalContext = cache(resolvePortalContext);
