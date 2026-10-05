import {
  agentClients,
  tenantSettings,
  withTenantContext,
  type TenantTransaction,
} from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { getActiveSubscription } from '@interdomestik/domain-membership-billing/subscription';
import { and, eq } from 'drizzle-orm';

export type ClaimAssignmentContext = {
  subscription: Awaited<ReturnType<typeof getActiveSubscription>>;
  branchId: string | null;
  agentId: string | null;
  agentAttributionSource: 'agent_clients' | 'subscription' | 'none';
  branchResolutionSource: 'subscription' | 'agent' | 'tenant_default' | 'none';
};

type ClaimAssignmentSources = {
  activeAgentId: string | null;
  agentBranchId: string | null;
  defaultBranchId: string | null;
};

function resolveDefaultBranchId(value: unknown): string | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value as
    { branchId?: string; defaultBranchId?: string; id?: string; value?: string } | string;
  if (typeof normalizedValue === 'string') {
    return normalizedValue;
  }

  return (
    normalizedValue.branchId ??
    normalizedValue.defaultBranchId ??
    normalizedValue.id ??
    normalizedValue.value ??
    null
  );
}

async function resolveAgentBranchId(
  tx: TenantTransaction,
  agentId: string,
  tenantId: string
): Promise<string | null> {
  const agent = await tx.query.user.findFirst({
    where: (user, { eq }) => withTenant(tenantId, user.tenantId, eq(user.id, agentId)),
    columns: { branchId: true },
  });

  return agent?.branchId ?? null;
}

async function readClaimAssignmentSources(
  tx: TenantTransaction,
  args: {
    userId: string;
    tenantId: string;
    subscriptionAgentId: string | null;
    subscriptionBranchId: string | null;
  }
): Promise<ClaimAssignmentSources> {
  const { tenantId } = args;
  const activeAssignment = await tx.query.agentClients.findFirst({
    where: withTenant(
      tenantId,
      agentClients.tenantId,
      and(eq(agentClients.memberId, args.userId), eq(agentClients.status, 'active'))
    ),
    columns: { agentId: true },
  });
  const agentId = activeAssignment?.agentId ?? args.subscriptionAgentId;
  let agentBranchId: string | null = null;
  if (!args.subscriptionBranchId && agentId) {
    agentBranchId = await resolveAgentBranchId(tx, agentId, tenantId);
  }
  const defaultBranchSetting = await tx.query.tenantSettings.findFirst({
    where: withTenant(
      tenantId,
      tenantSettings.tenantId,
      and(eq(tenantSettings.category, 'rbac'), eq(tenantSettings.key, 'default_branch_id'))
    ),
  });

  return {
    activeAgentId: activeAssignment?.agentId ?? null,
    agentBranchId,
    defaultBranchId: resolveDefaultBranchId(defaultBranchSetting?.value),
  };
}

export async function loadClaimAssignmentContext(
  userId: string,
  tenantId: string
): Promise<ClaimAssignmentContext> {
  // The membership lookup carries its own tenant context, so it must settle
  // before the assignment transaction opens: one connection, no nested tx.
  const subscription = await getActiveSubscription(userId, tenantId);
  const subscriptionBranchId = subscription?.branchId ?? null;
  const sources = await withTenantContext({ tenantId }, async tx =>
    readClaimAssignmentSources(tx, {
      userId,
      tenantId,
      subscriptionAgentId: subscription?.agentId ?? null,
      subscriptionBranchId,
    })
  );
  const { agentBranchId, defaultBranchId } = sources;
  const agentId = sources.activeAgentId ?? subscription?.agentId ?? null;
  let agentAttributionSource: ClaimAssignmentContext['agentAttributionSource'] = 'none';
  if (sources.activeAgentId) {
    agentAttributionSource = 'agent_clients';
  } else if (agentId) {
    agentAttributionSource = 'subscription';
  }
  const branchId = subscriptionBranchId ?? agentBranchId ?? defaultBranchId ?? null;
  let branchResolutionSource: ClaimAssignmentContext['branchResolutionSource'] = 'none';
  if (subscriptionBranchId) {
    branchResolutionSource = 'subscription';
  } else if (agentBranchId) {
    branchResolutionSource = 'agent';
  } else if (defaultBranchId) {
    branchResolutionSource = 'tenant_default';
  }

  return {
    subscription,
    branchId,
    agentId,
    agentAttributionSource,
    branchResolutionSource,
  };
}
