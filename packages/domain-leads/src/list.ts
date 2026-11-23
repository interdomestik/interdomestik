import { and, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { memberLeads } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { ROLES, isSuperAdmin, isTenantAdmin } from '@interdomestik/shared-auth';
import { z } from 'zod';

const MAX_LEADS = 100;

/** Strict: identity, tenant and scope never come from the caller (R-05). */
export const listMemberLeadsSchema = z
  .object({
    status: z
      .enum([
        'new',
        'contacted',
        'payment_pending',
        'paid',
        'converted',
        'lost',
        'disqualified',
        'expired',
      ])
      .optional(),
    branchId: z.string().optional(),
    search: z.string().optional(),
  })
  .strict();

export type ListMemberLeadsRefusal = 'FORBIDDEN' | 'FORBIDDEN_NO_BRANCH' | 'VALIDATION_ERROR';

type LeadVisibility =
  | { kind: 'agent'; agentId: string }
  | { kind: 'branch'; branchId: string }
  | { kind: 'tenant' }
  | { kind: 'refused'; code: 'FORBIDDEN' | 'FORBIDDEN_NO_BRANCH' };

/** The signed-in user the list is read for, as the session carries it. */
export type MemberLeadListActor = Readonly<{
  id: string;
  role?: string | null;
  branchId?: string | null;
}>;

/**
 * Who sees which member leads (R-16: the rule lives with the table's owner). Deny by default: an
 * agent sees its own leads, a branch manager its branch, the tenant and super admins the tenant;
 * every other role, and a principal without a role, is refused before any read. The principal must
 * be the signed-in user itself (same id, role and branch): an authority minted for anyone else is
 * refused, never read under.
 */
function leadVisibilityOf(actor: MemberLeadListActor, authority: TenantAuthority): LeadVisibility {
  const { principal } = readTenantAuthority(authority);
  const role = principal?.role;
  if (!principal || !role) return { kind: 'refused', code: 'FORBIDDEN' };
  // Role and branch must match exactly, as base compared them (a padded session role or branch is
  // refused). Only a blank session branch, which the authority stores as none, matches none.
  const sessionBranch = actor.branchId?.trim() ? actor.branchId : null;
  const bound =
    principal.userId === actor.id &&
    role === actor.role &&
    (principal.branchId ?? null) === sessionBranch;
  if (!bound) return { kind: 'refused', code: 'FORBIDDEN' };
  if (role === ROLES.agent) return { kind: 'agent', agentId: principal.userId };
  if (role === ROLES.branch_manager) {
    return principal.branchId?.trim()
      ? { kind: 'branch', branchId: principal.branchId }
      : { kind: 'refused', code: 'FORBIDDEN_NO_BRANCH' };
  }
  if (isTenantAdmin(role) || isSuperAdmin(role)) return { kind: 'tenant' };
  return { kind: 'refused', code: 'FORBIDDEN' };
}

/** The refusal for this actor and authority, or null when it may list leads at all. */
export function memberLeadListRefusal(
  actor: MemberLeadListActor,
  authority: TenantAuthority
): 'FORBIDDEN' | 'FORBIDDEN_NO_BRANCH' | null {
  const visibility = leadVisibilityOf(actor, authority);
  return visibility.kind === 'refused' ? visibility.code : null;
}

/**
 * The member leads the actor may see, newest first (at most 100), with their payment attempts.
 * The scope comes only from the authority's principal, bound to the actor; the input filters
 * inside it.
 */
export async function listVisibleMemberLeads(
  actor: MemberLeadListActor,
  authority: TenantAuthority,
  input: unknown
) {
  const visibility = leadVisibilityOf(actor, authority);
  if (visibility.kind === 'refused') {
    return { ok: false as const, code: visibility.code as ListMemberLeadsRefusal };
  }

  const parsed = listMemberLeadsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, code: 'VALIDATION_ERROR' as ListMemberLeadsRefusal };
  }
  const { status, search, branchId } = parsed.data;

  const { tenantId } = readTenantAuthority(authority);
  const conditions: SQL[] = [eq(memberLeads.tenantId, tenantId)];
  if (visibility.kind === 'agent') {
    conditions.push(eq(memberLeads.agentId, visibility.agentId));
  } else if (visibility.kind === 'branch') {
    conditions.push(eq(memberLeads.branchId, visibility.branchId));
  } else if (branchId) {
    conditions.push(eq(memberLeads.branchId, branchId));
  }
  if (status) conditions.push(eq(memberLeads.status, status));
  if (search) {
    const pattern = `%${search.toLowerCase()}%`;
    const searchCondition = or(
      ilike(memberLeads.firstName, pattern),
      ilike(memberLeads.lastName, pattern),
      ilike(memberLeads.email, pattern)
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  const leads = await withTenantAuthority(authority, tx =>
    tx.query.memberLeads.findMany({
      where: and(...conditions),
      orderBy: [desc(memberLeads.createdAt)],
      with: { leadPaymentAttempts: true },
      limit: MAX_LEADS,
    })
  );
  return { ok: true as const, leads };
}
