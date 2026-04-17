import { agentClients, claims, db } from '@interdomestik/database';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';

type ClaimAccessRecord = {
  branchId?: string | null;
  staffId?: string | null;
  userId: string;
};

const FULL_TENANT_ROLES = new Set(['admin', 'tenant_admin', 'super_admin']);
const SCOPED_CLAIMS_READ_ROLES = new Set(['staff', 'branch_manager']);

export function isFullTenantClaimsRole(role: string | null | undefined): boolean {
  return role ? FULL_TENANT_ROLES.has(role) : false;
}

export function isScopedClaimsReadRole(role: string | null | undefined): boolean {
  return role ? SCOPED_CLAIMS_READ_ROLES.has(role) : false;
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

export async function hasAgentClaimAccess(args: {
  agentId: string;
  memberId: string;
  tenantId: string;
}): Promise<boolean> {
  const linkedClient = await db.query.agentClients.findFirst({
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
}) {
  const branchId = args.branchId ?? null;

  if (args.role === 'staff' || args.role === 'branch_manager') {
    if (args.role === 'branch_manager' && branchId === null) {
      return db
        .select({ id: claims.id })
        .from(claims)
        .where(and(eq(claims.tenantId, args.tenantId), eq(claims.id, '__forbidden__')));
    }

    const scope =
      args.role === 'branch_manager'
        ? eq(claims.branchId, branchId as string)
        : branchId !== null
          ? eq(claims.branchId, branchId)
          : or(eq(claims.staffId, args.userId), isNull(claims.staffId));

    return db
      .select({ id: claims.id })
      .from(claims)
      .where(and(eq(claims.tenantId, args.tenantId), scope));
  }

  if (args.role === 'agent') {
    const activeMemberIds = db
      .select({ memberId: agentClients.memberId })
      .from(agentClients)
      .where(
        and(
          eq(agentClients.tenantId, args.tenantId),
          eq(agentClients.agentId, args.userId),
          eq(agentClients.status, 'active')
        )
      );

    return db
      .select({ id: claims.id })
      .from(claims)
      .where(and(eq(claims.tenantId, args.tenantId), inArray(claims.userId, activeMemberIds)));
  }

  return db
    .select({ id: claims.id })
    .from(claims)
    .where(and(eq(claims.tenantId, args.tenantId), eq(claims.userId, args.userId)));
}
