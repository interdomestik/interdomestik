// Action helpers — shared by ops-actions.ts server actions

import { auth } from '@/lib/auth';
import { and, auditLog, claims, db, eq } from '@interdomestik/database';
import { ClaimStatus } from '@interdomestik/database/constants';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { ALLOWED_TRANSITIONS } from '../domain/claiming-rules';
import { TERMINAL_STATUSES } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type OpsActionResponse =
  | { success: true; message?: string }
  | { success: false; error: string };

export type MutationIntent = 'assign' | 'status_change' | 'poke' | 'sla_ack';

export interface ActionContext {
  session: Awaited<ReturnType<typeof auth.api.getSession>> & { user: { id: string; role: string } };
  tenantId: string;
  claim: typeof claims.$inferSelect;
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

// ─────────────────────────────────────────────────────────────────────────────
// Claim Fetching + Guards
// ─────────────────────────────────────────────────────────────────────────────

export async function getClaimForMutation(claimId: string, tenantId: string) {
  const claim = await db.query.claims.findFirst({
    where: and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)),
  });

  if (!claim) {
    throw new Error('Claim not found or access denied');
  }
  return claim;
}

export function assertCanMutateClaim(
  claim: typeof claims.$inferSelect,
  _actorRole: string,
  intent: MutationIntent
) {
  const isTerminal = TERMINAL_STATUSES.includes(claim.status as ClaimStatus);
  if (isTerminal && intent !== 'status_change') {
    throw new Error(`Cannot perform ${intent} on a terminal claim.`);
  }
}

export function assertTransitionAllowed(currentStatus: ClaimStatus, newStatus: ClaimStatus) {
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Illegal transition from ${currentStatus} to ${newStatus}`);
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
  metadata: Record<string, unknown> = {}
) {
  await db.insert(auditLog).values({
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

export function revalidateClaim(locale: string, claimId: string) {
  revalidatePath(`/${locale}/admin/claims/${claimId}`, 'page');
  revalidatePath(`/${locale}/admin/claims`, 'page');
}
