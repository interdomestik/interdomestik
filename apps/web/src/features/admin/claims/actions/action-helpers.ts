// Action helpers — shared by ops-actions.ts server actions

import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/roles';
import { and, auditLog, claims, db, eq, type TenantTransaction } from '@interdomestik/database';
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { isClaimStatusTransitionInGraph } from '@interdomestik/domain-claims/claims/transition-guard';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { TERMINAL_STATUSES } from '../types';
import { OpsDomainDenialError, type OpsActionResult } from './ops-action-outcome';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type OpsActionResponse = OpsActionResult;

export type MutationIntent = 'assign' | 'status_change' | 'poke' | 'sla_ack';

// Optional executors let one action run its reads/writes inside a tenant transaction.
// Callers that omit them keep the existing direct `db` behavior.
export type ClaimReadExecutor = Pick<TenantTransaction, 'query'>;
export type AuditWriteExecutor = Pick<TenantTransaction, 'insert'>;
export type ClaimLockExecutor = Pick<TenantTransaction, 'select'>;

export type OpsMutationContext = Readonly<{
  actorId: string;
  actorRole: string;
  tenantId: string;
}>;

const CLAIM_NOT_FOUND_ERROR = 'Claim not found or access denied';

export interface ActionContext {
  session: Awaited<ReturnType<typeof auth.api.getSession>> & { user: { id: string; role: string } };
  tenantId: string;
  claim: typeof claims.$inferSelect & { status: ClaimStatus };
}

// ─────────────────────────────────────────────────────────────────────────────
// Session + Tenant
// ─────────────────────────────────────────────────────────────────────────────

export async function getActionSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const tenantId = ensureTenantId(session);
  return { session, tenantId };
}

// Admin ops claim mutations (status change, SLA acknowledgement, internal reminder) admit only
// the exercised session admin family. This runs before any claim/resource read or tenant
// transaction; client canAssign/readOnly flags, persisted role grants, host, locale and the
// session home tenant never widen it. Auth session retrieval itself is the only prior I/O.
export async function getOpsMutationContext(): Promise<OpsMutationContext | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const actorId = session?.user?.id;
  const actorRole = session?.user?.role;
  if (!session || !actorId || typeof actorRole !== 'string' || !isAdmin(actorRole)) return null;
  // ensureTenantId keeps the canonical effective access tenant (explicit access, then home).
  return { actorId, actorRole, tenantId: ensureTenantId(session) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Claim Fetching + Guards
// ─────────────────────────────────────────────────────────────────────────────

export async function getClaimForMutation(
  claimId: string,
  tenantId: string,
  executor: ClaimReadExecutor = db
) {
  const claim = await executor.query.claims.findFirst({
    where: and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)),
  });

  if (!claim) {
    throw new OpsDomainDenialError(CLAIM_NOT_FOUND_ERROR);
  }
  return { ...claim, status: claimStatusFromLifecycleFields(claim) };
}

// Serializes ops effects on one claim (e.g. the reminder cooldown) with a row lock taken inside
// the caller's tenant transaction. The predicate is the same home-tenant writer anchor as
// getClaimForMutation: it never coalesces the access tenant or widens transferred-claim authority.
export async function lockClaimForOpsMutation(
  executor: ClaimLockExecutor,
  claimId: string,
  tenantId: string
): Promise<void> {
  // db-access-guard: tenant-scoped -- reason: tenantId is the trusted access tenant of the enclosing tenant transaction
  const locked = await executor
    .select({ id: claims.id })
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)))
    .limit(1)
    .for('update');
  if (locked.length === 0) {
    throw new OpsDomainDenialError(CLAIM_NOT_FOUND_ERROR);
  }
}

export function assertCanMutateClaim(
  claim: typeof claims.$inferSelect & { status: ClaimStatus },
  _actorRole: string,
  intent: MutationIntent
) {
  const isTerminal = TERMINAL_STATUSES.includes(claim.status as ClaimStatus);
  if (isTerminal && intent !== 'status_change') {
    throw new OpsDomainDenialError(`Cannot perform ${intent} on a terminal claim.`);
  }
}

// Admin ops assignment is limited to the exercised session role; persisted grants and the
// broader staff-domain claims.assign capability do not widen this admin action.
export function canAssignClaimOwner(actorRole: string | null | undefined): boolean {
  return isAdmin(actorRole);
}

export function assertTransitionAllowed(currentStatus: ClaimStatus, newStatus: ClaimStatus) {
  if (!isClaimStatusTransitionInGraph(currentStatus, newStatus)) {
    throw new OpsDomainDenialError(`Illegal transition from ${currentStatus} to ${newStatus}`);
  }
}

export function assertRowsAffected(updated: { id: string }[]) {
  if (updated.length === 0) {
    throw new Error('Failed to update claim - no rows affected');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit + Revalidation
// ─────────────────────────────────────────────────────────────────────────────

export async function logAudit(
  tenantId: string,
  actorId: string,
  action: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
  executor: AuditWriteExecutor = db
) {
  // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
  await executor.insert(auditLog).values({
    id: nanoid(),
    tenantId,
    actorId,
    action,
    entityType: 'claim',
    entityId,
    metadata,
    createdAt: new Date(),
  });
}

// CRITICAL: Invalidate BOTH the specific claim detail page AND the main list page (for KPIs)
export function revalidateClaim(locale: string, claimId: string) {
  revalidatePath(`/${locale}/admin/claims/${claimId}`, 'page');
  revalidatePath(`/${locale}/admin/claims`, 'page');
}
