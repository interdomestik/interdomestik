import { db } from '@interdomestik/database/db';
import { agentClients } from '@interdomestik/database/schema';
import { and, eq, type SQL } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import { ROLE_AGENT } from './roles.core';
import type { ProtectedActionContext } from './safe-action';

/**
 * Standardized Scope Filter for Drizzle Queries.
 * Automatically applies Branch/Agent scoping based on the strict context.
 */
export function scopeFilter(
  ctx: ProtectedActionContext,
  table: {
    branchId?: PgColumn;
    agentId?: PgColumn;
    userId?: PgColumn;
  }
): SQL | undefined {
  const { branchId, actorAgentId } = ctx.scope;
  const conditions: SQL[] = [];

  // 1. Branch Scoping
  // If context has a branchId, we MUST filter by it.
  if (branchId && table.branchId && IsPgColumn(table.branchId)) {
    conditions.push(eq(table.branchId, branchId));
  }

  // 2. Agent Scoping (Strict Ownership)
  // If acting as an agent, they can only see rows where THEY are the assigned agent.
  if (actorAgentId) {
    if (table.agentId && IsPgColumn(table.agentId)) {
      // Primary match: Assigned Agent
      conditions.push(eq(table.agentId, actorAgentId));
    } else if (table.userId && IsPgColumn(table.userId)) {
      // Fallback: If table has no agentId, usually implies they created it (users, etc)
      conditions.push(eq(table.userId, actorAgentId));
    }
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

// Type Guard
function IsPgColumn(col: unknown): col is PgColumn {
  return !!col && typeof col === 'object' && 'name' in col;
}

// --- Permission Helpers ---

export function canAgentCreateClaim(ctx: ProtectedActionContext): boolean {
  // Only actors with a verified Agent Identity can create claims "as an agent"
  return !!ctx.scope.actorAgentId;
}

export function canStaffHandleClaim(ctx: ProtectedActionContext): boolean {
  // Staff (tenant-wide null branch) or Branch Managers (scoped branch)
  return !ctx.scope.actorAgentId;
}

export function allowedClaimStatusTransitions(userRole: string): string[] {
  if (userRole === ROLE_AGENT) {
    // Agents can only move from nothing -> drafted -> submitted (intake only)
    return ['draft', 'submitted'];
  }
  // Staff/Admins can do anything
  return ['draft', 'submitted', 'reviewed', 'in_progress', 'resolved', 'rejected', 'paid'];
}

/**
 * Ensures an agent has access to a specific client.
 * @throws Error if access is denied.
 */
export async function assertAgentClientAccess(ctx: ProtectedActionContext, clientUserId: string) {
  const { actorAgentId } = ctx.scope;
  if (!actorAgentId) return; // Not an agent (Admin/Staff), pass.

  const [link] = await db
    .select({ id: agentClients.id })
    .from(agentClients)
    .where(
      and(
        eq(agentClients.tenantId, ctx.tenantId),
        eq(agentClients.agentId, actorAgentId),
        eq(agentClients.memberId, clientUserId),
        eq(agentClients.status, 'active')
      )
    )
    .limit(1);

  if (!link) {
    const error = new Error('Security Violation: Unauthorized client access.');
    (error as any).code = 'FORBIDDEN_SCOPE_MISMATCH';
    throw error;
  }
}
