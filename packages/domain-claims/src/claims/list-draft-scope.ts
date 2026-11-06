import type { SessionWithTenant } from '@interdomestik/shared-auth';
import type { SQL } from 'drizzle-orm';

import { claimLifecycleStatusNotIn } from './lifecycle-read-sql';
import type { ClaimsScope } from './list-types';

// Member drafts reach staff only after submission, so every staff listing and the unassigned
// queue exclude them. A member listing their own claims keeps their drafts.
export function listDraftExclusion(
  scope: ClaimsScope,
  session: SessionWithTenant | null | undefined
): SQL[] {
  const excludesDrafts =
    scope === 'staff_unassigned' || (scope !== 'member' && session?.user?.role === 'staff');
  return excludesDrafts ? [claimLifecycleStatusNotIn(['draft'])] : [];
}
