import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

function readStringValue(value: unknown, preferredKeys: readonly string[]): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;

  for (const key of preferredKeys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

async function resolveDefaultBranchId(authority: TenantAuthority): Promise<string | null> {
  const { tenantId } = readTenantAuthority(authority);
  const defaultBranchSetting = await withTenantAuthority(
    authority,
    async tx =>
      await tx.query.tenantSettings.findFirst({
        where: (settings, { and, eq }) =>
          and(
            eq(settings.tenantId, tenantId),
            eq(settings.category, 'rbac'),
            eq(settings.key, 'default_branch_id')
          ),
        columns: { value: true },
      })
  );

  return readStringValue(defaultBranchSetting?.value, [
    'branchId',
    'defaultBranchId',
    'id',
    'value',
  ]);
}

export async function resolveBusinessLeadOwner(
  authority: TenantAuthority
): Promise<{ agentId: string; branchId: string } | null> {
  const { tenantId } = readTenantAuthority(authority);
  const ownerSetting = await withTenantAuthority(
    authority,
    async tx =>
      await tx.query.tenantSettings.findFirst({
        where: (settings, { and, eq }) =>
          and(
            eq(settings.tenantId, tenantId),
            eq(settings.category, 'sales'),
            eq(settings.key, 'business_lead_owner')
          ),
        columns: { value: true },
      })
  );

  const agentId = readStringValue(ownerSetting?.value, ['agentId', 'ownerAgentId', 'id', 'value']);

  if (!agentId) {
    return null;
  }

  const owner = await withTenantAuthority(
    authority,
    async tx =>
      await tx.query.user.findFirst({
        where: (users, { and, eq }) => and(eq(users.id, agentId), eq(users.tenantId, tenantId)),
        columns: { id: true, branchId: true },
      })
  );

  if (!owner?.id) {
    return null;
  }

  const configuredBranchId = readStringValue(ownerSetting?.value, [
    'branchId',
    'defaultBranchId',
    'branch',
  ]);
  const branchId =
    configuredBranchId ?? owner.branchId ?? (await resolveDefaultBranchId(authority));

  if (!branchId) {
    return null;
  }

  return {
    agentId: owner.id,
    branchId,
  };
}
