import { db } from '@interdomestik/database';

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

async function resolveDefaultBranchId(tenantId: string): Promise<string | null> {
  const defaultBranchSetting = await db.query.tenantSettings.findFirst({
    where: (settings, { and, eq }) =>
      and(
        eq(settings.tenantId, tenantId),
        eq(settings.category, 'rbac'),
        eq(settings.key, 'default_branch_id')
      ),
    columns: { value: true },
  });

  return readStringValue(defaultBranchSetting?.value, [
    'branchId',
    'defaultBranchId',
    'id',
    'value',
  ]);
}

export async function resolveBusinessLeadOwner(
  tenantId: string
): Promise<{ agentId: string; branchId: string } | null> {
  const ownerSetting = await db.query.tenantSettings.findFirst({
    where: (settings, { and, eq }) =>
      and(
        eq(settings.tenantId, tenantId),
        eq(settings.category, 'sales'),
        eq(settings.key, 'business_lead_owner')
      ),
    columns: { value: true },
  });

  const agentId = readStringValue(ownerSetting?.value, ['agentId', 'ownerAgentId', 'id', 'value']);

  if (!agentId) {
    return null;
  }

  const owner = await db.query.user.findFirst({
    where: (users, { and, eq }) => and(eq(users.id, agentId), eq(users.tenantId, tenantId)),
    columns: { id: true, branchId: true },
  });

  if (!owner?.id) {
    return null;
  }

  const configuredBranchId = readStringValue(ownerSetting?.value, [
    'branchId',
    'defaultBranchId',
    'branch',
  ]);
  const branchId = configuredBranchId ?? owner.branchId ?? (await resolveDefaultBranchId(tenantId));

  if (!branchId) {
    return null;
  }

  return {
    agentId: owner.id,
    branchId,
  };
}
