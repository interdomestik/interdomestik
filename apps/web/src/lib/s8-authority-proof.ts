// Synthetic CI authority positive control. Never merge or mount this draft.
import { user, withTenantContext } from '@interdomestik/database';

export function syntheticAuthorityPositiveControl(tenantId: string) {
  return withTenantContext({ tenantId }, async tx => tx.select().from(user));
}
