import { agentClients, claims, user, type TenantTransaction } from '@interdomestik/database';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';

type ClaimAccessRecord = {
  branchId?: string | null;
  staffId?: string | null;
  userId: string;
};

export function isFullTenantClaimsRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'tenant_admin' || role === 'super_admin';
}

export function isScopedClaimsReadRole(role: string | null | undefined): boolean {
  return role === 'staff' || role === 'branch_manager';
}

export function hasScopedStaffClaimAccess(args: {
  branchId?: string | null;
  claim: ClaimAccessRecord;
  userId: string;
}): boolean {
  const branchId = args.branchId ?? null;

  if (branchId !== null) {
    return args.claim.branchId === branchId;
  }

  return args.claim.staffId === args.userId || args.claim.staffId == null;
}

export function hasScopedClaimsReadAccess(args: {
  branchId?: string | null;
  claim: ClaimAccessRecord;
  role: string | null | undefined;
  userId: string;
}): boolean {
  if (args.role === 'branch_manager') {
    const branchId = args.branchId ?? null;
    return branchId !== null && args.claim.branchId === branchId;
  }

  return hasScopedStaffClaimAccess({
    branchId: args.branchId,
    claim: args.claim,
    userId: args.userId,
  });
}

function buildForbiddenClaimIdsSubquery(
  tenantId: string,
  database: Pick<TenantTransaction, 'select'>
) {
  return database
    .select({ id: claims.id })
    .from(claims)
    .where(and(eq(claims.tenantId, tenantId), eq(claims.id, '__forbidden__')));
}

function buildStaffScopedClaimFilter(args: {
  branchId: string | null;
  role: 'staff' | 'branch_manager';
  userId: string;
}) {
  if (args.role === 'branch_manager') {
    if (args.branchId === null) {
      throw new Error('branch_manager claim filters require a branchId');
    }

    return eq(claims.branchId, args.branchId);
  }

  if (args.branchId !== null) {
    return eq(claims.branchId, args.branchId);
  }

  return or(eq(claims.staffId, args.userId), isNull(claims.staffId));
}

export async function readAgentScope(
  tx: TenantTransaction,
  args: { tenantId: string; userId: string }
): Promise<{ branchId: string | null } | null> {
  const actor = await tx.query.user.findFirst({
    where: and(eq(user.id, args.userId), eq(user.tenantId, args.tenantId)),
    columns: { branchId: true },
  });
  return actor ? { branchId: actor.branchId ?? null } : null;
}

export async function hasAgentClaimAccess(args: {
  agentId: string;
  agentBranchId: string | null;
  claimBranchId: string | null;
  memberId: string;
  tenantId: string;
  tx: TenantTransaction;
}): Promise<boolean> {
  // Read the same current tenant identity used by the workspace, not a cached session branch.
  const scope = await readAgentScope(args.tx, {
    tenantId: args.tenantId,
    userId: args.agentId,
  });
  if (!scope) return false;
  if (
    scope.branchId !== null &&
    args.claimBranchId !== null &&
    args.claimBranchId !== scope.branchId
  ) {
    return false;
  }

  const linkedClient = await args.tx.query.agentClients.findFirst({
    where: (table, { and, eq }) =>
      and(
        eq(table.tenantId, args.tenantId),
        eq(table.agentId, args.agentId),
        eq(table.memberId, args.memberId),
        eq(table.status, 'active')
      ),
  });

  return linkedClient != null;
}

export function buildAccessibleClaimIdsSubquery(args: {
  branchId?: string | null;
  role: string | null | undefined;
  tenantId: string;
  userId: string;
  tx: TenantTransaction;
}) {
  const database = args.tx;
  const branchId = args.branchId ?? null;

  if (args.role === 'staff' || args.role === 'branch_manager') {
    if (args.role === 'branch_manager' && branchId === null) {
      return buildForbiddenClaimIdsSubquery(args.tenantId, database);
    }

    const scope = buildStaffScopedClaimFilter({
      branchId,
      role: args.role,
      userId: args.userId,
    });

    return database
      .select({ id: claims.id })
      .from(claims)
      .where(and(eq(claims.tenantId, args.tenantId), scope));
  }

  if (args.role === 'agent') {
    const activeMemberIds = database
      .select({ memberId: agentClients.memberId })
      .from(agentClients)
      .where(
        and(
          eq(agentClients.tenantId, args.tenantId),
          eq(agentClients.agentId, args.userId),
          eq(agentClients.status, 'active')
        )
      );

    if (branchId !== null && typeof branchId !== 'string') {
      throw new Error('Invalid agent branch context');
    }

    const branchScope =
      branchId === null ? undefined : or(eq(claims.branchId, branchId), isNull(claims.branchId));

    return database
      .select({ id: claims.id })
      .from(claims)
      .where(
        and(
          eq(claims.tenantId, args.tenantId),
          inArray(claims.userId, activeMemberIds),
          branchScope
        )
      );
  }

  return database
    .select({ id: claims.id })
    .from(claims)
    .where(and(eq(claims.tenantId, args.tenantId), eq(claims.userId, args.userId)));
}
