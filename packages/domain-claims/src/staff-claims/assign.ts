import { reportServerError } from '@interdomestik/domain-communications/server-error';
import { and, auditLog, claims, eq, user, type TenantTransaction } from '@interdomestik/database';
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import { resolveClaimStatusActor, type ClaimStatusActor } from '../claims/status-actor';
import { assignClaimSchema } from '../validators/claims';
import { buildScopedStaffClaimWhere } from './scope';

export const changeClaimAssignmentInputSchema = z.strictObject({
  claimId: z.string().min(1).max(128),
  staffId: assignClaimSchema.shape.staffId.optional(),
});

type AssignmentError =
  | 'forbidden_role'
  | 'invalid_input'
  | 'not_found'
  | 'draft'
  | 'terminal'
  | 'target_denied'
  | 'conflict'
  | 'transaction_failed';

type AssignmentSnapshot = {
  id: string;
  staffId: string | null;
  assignedAt: Date | null;
  assignedById: string | null;
};

export type ChangeClaimAssignmentResult =
  | { ok: true; changed: boolean; assignment: AssignmentSnapshot }
  | { ok: false; code: AssignmentError };

class AssignmentConflict extends Error {}

async function lockAssignableTarget(
  tx: TenantTransaction,
  actor: ClaimStatusActor,
  targetId: string
) {
  // db-access-guard: tenant-scoped -- reason: tenant comes from the assignment authority.
  const [target] = await tx
    .select({ id: user.id })
    .from(user)
    .where(
      withTenant(
        actor.tenantId,
        user.tenantId,
        and(
          eq(user.id, targetId),
          eq(user.role, 'staff'),
          actor.kind === 'staff' && actor.branchId !== null && targetId !== actor.id
            ? eq(user.branchId, actor.branchId)
            : undefined
        )
      )
    )
    .for('share');
  return target;
}

function recordAssignmentAudit(
  tx: TenantTransaction,
  actor: ClaimStatusActor,
  claim: Pick<typeof claims.$inferSelect, 'id' | 'staffId' | 'claimNumber'>,
  staffId: string | null,
  now: Date,
  requestHeaders?: Headers
) {
  const staffAction = staffId === null ? 'claim.unassigned' : 'claim.assigned';
  const adminAction = staffId === null ? 'unassign_owner' : 'assign_owner';
  const metadata =
    actor.kind === 'staff'
      ? {
          previousStaffId: claim.staffId,
          newStaffId: staffId,
          ip:
            requestHeaders?.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            requestHeaders?.get('x-real-ip') ||
            undefined,
          userAgent: requestHeaders?.get('user-agent') || undefined,
        }
      : {
          previousStaffId: claim.staffId,
          claimNumber: claim.claimNumber,
          ...(staffId === null ? {} : { newStaffId: staffId }),
        };

  // db-access-guard: tenant-scoped -- reason: the assignment audit commits with the scoped update.
  return tx.insert(auditLog).values({
    id: nanoid(),
    tenantId: actor.tenantId,
    actorId: actor.id,
    actorRole: actor.kind === 'staff' ? 'staff' : actor.role,
    action: actor.kind === 'staff' ? staffAction : adminAction,
    entityType: 'claim',
    entityId: claim.id,
    metadata,
    createdAt: now,
  });
}

async function assignInTransaction(
  tx: TenantTransaction,
  actor: ClaimStatusActor,
  claimId: string,
  staffId: string | null,
  requestHeaders?: Headers
): Promise<ChangeClaimAssignmentResult> {
  const tenantId = actor.tenantId;
  const claimScope =
    actor.kind === 'staff'
      ? buildScopedStaffClaimWhere({
          tenantId,
          claimId,
          userId: actor.id,
          branchId: actor.branchId,
        })
      : withTenant(tenantId, claims.tenantId, eq(claims.id, claimId));
  // db-access-guard: tenant-scoped -- reason: scoped claim lock uses the actor's validated tenant.
  const [claim] = await tx.select().from(claims).where(claimScope).for('no key update');
  if (!claim) return { ok: false, code: 'not_found' };

  if (actor.kind === 'admin') {
    const status = claimStatusFromLifecycleFields(claim);
    if (status === 'resolved' || status === 'rejected') return { ok: false, code: 'terminal' };
    if (staffId !== null && status === 'draft') return { ok: false, code: 'draft' };
  }

  if (claim.staffId === staffId && (actor.kind === 'staff' || staffId === null)) {
    return {
      ok: true,
      changed: false,
      assignment: {
        id: claim.id,
        staffId,
        assignedAt: claim.assignedAt,
        assignedById: claim.assignedById,
      },
    };
  }
  if (staffId !== null && !(await lockAssignableTarget(tx, actor, staffId))) {
    return { ok: false, code: 'target_denied' };
  }

  const now = new Date();
  // db-access-guard: tenant-scoped -- reason: the update repeats the scoped lock and lifecycle snapshot.
  const [assignment] = await tx
    .update(claims)
    .set({
      staffId,
      assignedAt: staffId === null ? null : now,
      assignedById: staffId === null ? null : actor.id,
      updatedAt: now,
    })
    .where(
      and(
        claimScope,
        claim.staffId === null ? isNull(claims.staffId) : eq(claims.staffId, claim.staffId),
        eq(claims.caseLifecycleState, claim.caseLifecycleState),
        eq(claims.recoveryLifecycleState, claim.recoveryLifecycleState)
      )
    )
    .returning({
      id: claims.id,
      staffId: claims.staffId,
      assignedAt: claims.assignedAt,
      assignedById: claims.assignedById,
    });
  if (!assignment) throw new AssignmentConflict();

  await recordAssignmentAudit(tx, actor, claim, staffId, now, requestHeaders);
  return { ok: true, changed: true, assignment };
}

export async function changeClaimAssignment(
  authority: TenantAuthority,
  input: unknown,
  meta: { requestHeaders?: Headers } = {}
): Promise<ChangeClaimAssignmentResult> {
  let actor: ClaimStatusActor | null;
  try {
    actor = resolveClaimStatusActor(authority);
  } catch {
    return { ok: false, code: 'forbidden_role' };
  }
  if (!actor) return { ok: false, code: 'forbidden_role' };

  const parsed = changeClaimAssignmentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid_input' };

  let { staffId } = parsed.data;
  if (actor.kind === 'admin') {
    if (staffId === undefined) return { ok: false, code: 'invalid_input' };
    staffId = staffId?.trim() ?? null;
    if (staffId === '' || staffId === actor.id) return { ok: false, code: 'target_denied' };
  }
  const targetId = staffId === undefined ? actor.id : staffId;
  try {
    return await withTenantAuthority(authority, tx =>
      assignInTransaction(tx, actor, parsed.data.claimId, targetId, meta.requestHeaders)
    );
  } catch (error) {
    if (error instanceof AssignmentConflict) return { ok: false, code: 'conflict' };
    reportServerError('Claim assignment transaction failed', error);
    return { ok: false, code: 'transaction_failed' };
  }
}
