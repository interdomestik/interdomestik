import {
  and,
  auditLog,
  claims,
  serviceUsage,
  sql,
  type TenantTransaction,
} from '@interdomestik/database';
import { isNull, type SQL } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { getRecoveryDeclinePublicNote } from '../staff-claims/recovery-decision';
import { upsertRecoveryDecisionRecord } from '../staff-claims/recovery-decision-record';
import {
  safePublicStatusNote,
  type StatusNoteDecision,
} from '../staff-claims/rejected-claim-public-note';
import type { RecoveryDeclineReasonCode } from '../staff-claims/types';
import type { RecoveryUsage } from './change-status-recovery';
import {
  ClaimTransitionConflictError,
  recordAuthorizedTransitionSideEffects,
  writeAuthorizedTransitionStatus,
  type PersistAuthorizedTransitionArgs,
} from './transition';

type RecoveryDecline = { code: RecoveryDeclineReasonCode; explanation?: string };
type StatusWrite = {
  transition: Omit<PersistAuthorizedTransitionArgs, 'readWhere'>;
  previousStaffId: string | null;
  decline: RecoveryDecline | null;
  decision: StatusNoteDecision | undefined;
  usage: RecoveryUsage | null;
  requestHeaders?: Headers;
};

async function autoAssign(
  tx: TenantTransaction,
  scope: SQL,
  transition: StatusWrite['transition'],
  now: Date
) {
  const { actor, claimId, tenantId } = transition;
  // db-access-guard: tenant-scoped -- reason: scope carries the scoped claim and tenant predicates.
  const [assigned] = await tx
    .update(claims)
    .set({
      staffId: actor.id,
      assignedAt: sql`coalesce(${claims.assignedAt}, ${now.toISOString().slice(0, -1)}::timestamp)`,
      assignedById: sql`coalesce(${claims.assignedById}, ${actor.id})`,
      updatedAt: now,
    })
    .where(and(scope, isNull(claims.staffId)))
    .returning({ id: claims.id });
  if (!assigned) throw new ClaimTransitionConflictError(claimId);

  // db-access-guard: tenant-scoped -- reason: tenant is read from the command authority.
  await tx.insert(auditLog).values({
    id: nanoid(),
    tenantId,
    actorId: actor.id,
    actorRole: actor.role,
    action: 'claim.assigned',
    entityType: 'claim',
    entityId: claimId,
    metadata: { previousStaffId: null, newStaffId: actor.id, reason: 'status_change' },
    createdAt: now,
  });
}

async function recordMatterServiceUsage(
  tx: TenantTransaction,
  tenantId: string,
  usage: RecoveryUsage
) {
  // db-access-guard: tenant-scoped -- reason: tenant is read from the command authority.
  await tx
    .insert(serviceUsage)
    .values({ id: crypto.randomUUID(), tenantId, ...usage })
    .onConflictDoNothing({
      target: [serviceUsage.tenantId, serviceUsage.subscriptionId, serviceUsage.serviceCode],
    });
}

export async function persistClaimStatusChange(
  tx: TenantTransaction,
  scope: SQL,
  write: StatusWrite
) {
  const { transition, decline, decision, usage, previousStaffId, requestHeaders } = write;
  const { actor, claimId, current, isPublic, tenantId } = transition;
  const toStatus = transition.authorization.to;
  const changed = current.status !== toStatus;
  const now = new Date();

  if (decline) {
    await upsertRecoveryDecisionRecord({
      tx,
      tenantId,
      claimId,
      actor: { id: actor.id, role: actor.role ?? 'unknown' },
      decisionType: 'declined',
      declineReasonCode: decline.code,
      explanation: decline.explanation,
    });
  }

  const written = changed
    ? await writeAuthorizedTransitionStatus(tx, transition, scope, now)
    : { lifecycleVersion: current.lifecycleVersion, now, toStatus };
  const candidate =
    decline && isPublic
      ? getRecoveryDeclinePublicNote(decline.code, transition.note ?? undefined)
      : transition.note;
  const note = safePublicStatusNote(
    { fromStatus: current.status, isPublic, note: candidate },
    decline ? { decisionType: 'declined', declineReasonCode: decline.code } : decision
  );
  await recordAuthorizedTransitionSideEffects(tx, transition, written, note);
  if (!changed) await writeAuthorizedTransitionStatus(tx, transition, scope, now);
  if (usage) await recordMatterServiceUsage(tx, tenantId, usage);
  if (actor.role === 'staff' && previousStaffId === null)
    await autoAssign(tx, scope, transition, now);

  // db-access-guard: tenant-scoped -- reason: tenant is read from the command authority.
  await tx.insert(auditLog).values({
    id: nanoid(),
    tenantId,
    actorId: actor.id,
    actorRole: actor.role,
    action: changed ? 'claim.status_changed' : 'claim.status_note_added',
    entityType: 'claim',
    entityId: claimId,
    metadata: {
      previousStatus: current.status,
      newStatus: toStatus,
      lifecycleVersion: written.lifecycleVersion,
      isPublicNote: isPublic,
      ip:
        requestHeaders?.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        requestHeaders?.get('x-real-ip') ||
        undefined,
      userAgent: requestHeaders?.get('user-agent') || undefined,
    },
    createdAt: now,
  });
  return written.lifecycleVersion;
}
