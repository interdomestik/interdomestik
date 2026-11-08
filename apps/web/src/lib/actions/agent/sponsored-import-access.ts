import { getAgentTier } from '@/app/[locale]/(agent)/agent/_layout.core';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

/**
 * SRS OD-18 Option B: sponsored group membership stays dark until its sponsor controls exist. A
 * tenant opts in explicitly with this setting (`{ "enabled": true }`); a missing or other value
 * keeps the roster import closed.
 */
export const SPONSORED_IMPORT_SETTING = {
  category: 'acquisition',
  key: 'sponsored_import',
} as const;

export type SponsoredImportAccess = 'allowed' | 'dark' | 'not_office';

async function isSponsoredImportEnabled(authority: TenantAuthority): Promise<boolean> {
  const { tenantId } = readTenantAuthority(authority);
  const setting = await withTenantAuthority(authority, tx =>
    tx.query.tenantSettings.findFirst({
      where: (settings, { and, eq }) =>
        and(
          eq(settings.tenantId, tenantId),
          eq(settings.category, SPONSORED_IMPORT_SETTING.category),
          eq(settings.key, SPONSORED_IMPORT_SETTING.key)
        ),
      columns: { value: true },
    })
  );
  return setting?.value?.enabled === true;
}

/** Whether this agent may use the roster import: the tenant enabled it and the agent is office tier. */
export async function resolveSponsoredImportAccess(params: {
  agentId: string;
  authority: TenantAuthority;
}): Promise<SponsoredImportAccess> {
  if (!(await isSponsoredImportEnabled(params.authority))) {
    return 'dark';
  }
  const tier = await getAgentTier({ agentId: params.agentId, authority: params.authority });
  return tier === 'office' ? 'allowed' : 'not_office';
}
