import { claims } from '@interdomestik/database/schema';
import { and, eq, inArray, or, SQL } from 'drizzle-orm';

export interface ClaimVisibilityContext {
  tenantId: string;
  userId: string;
  role: string | null;
  branchId: string | null;
  agentMemberIds?: string[]; // If role is agent, list of member IDs they manage
}

/**
 * reliable helper to build WHERE clause for claim visibility
 * Enforces Tenant Isolation first.
 * Then applies RBAC.
 */
export function buildClaimVisibilityWhere(context: ClaimVisibilityContext): SQL {
  const { tenantId, userId, role, branchId, agentMemberIds } = context;

  // 1. Tenant Scope (Fundamental)
  const conditions: SQL[] = [eq(claims.tenantId, tenantId)];

  // 2. RBAC Scope
  switch (role) {
    case 'member':
      // Member sees ONLY their own claims
      conditions.push(eq(claims.userId, userId));
      break;

    case 'agent':
      // Agent sees claims of members they serve.
      // EITHER explicitly assigned as agent on the claim
      // OR the claim belongs to a member who is assigned to this agent (via subscription or user relation)
      // For performance, we prefer passing `agentMemberIds` if pre-fetched,
      // or we can rely on `agentId` column on claim if it's reliable.
      // Fallback: If agentId on claim is populated:
      if (agentMemberIds && agentMemberIds.length > 0) {
        conditions.push(or(eq(claims.agentId, userId), inArray(claims.userId, agentMemberIds))!);
      } else {
        // Strict fallback if no members pre-fetched
        conditions.push(eq(claims.agentId, userId));
      }
      break;

    case 'branch_manager':
      // Sees all in branch
      if (branchId) {
        conditions.push(eq(claims.branchId, branchId));
      } else {
        // Safety: BM without branch sees nothing or only their own?
        // Let's assume nothing to be safe, or just their own if they have any.
        conditions.push(eq(claims.userId, userId)); // Fallback
      }
      break;

    case 'staff':
      // Assigned OR Branch
      if (branchId) {
        conditions.push(or(eq(claims.branchId, branchId), eq(claims.staffId, userId))!);
      } else {
        conditions.push(eq(claims.staffId, userId));
      }
      break;

    case 'admin':
    case 'tenant_admin':
    case 'super_admin':
      // Sees all in tenant
      break;

    default:
      // Unknown role -> Access Denied (or only own)
      conditions.push(eq(claims.userId, userId));
  }

  return and(...conditions)!;
}
