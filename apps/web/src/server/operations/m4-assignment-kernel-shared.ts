import type { TenantTransaction } from '@interdomestik/database';
import { auditLog, claims, user } from '@interdomestik/database/schema';
import { and, eq, isNull, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// Only the private controller constructs this from the current FOR SHARE actor row.
export type M4AssignmentActor = Readonly<{
  id: string;
  role: string;
  tenantId: string;
  branchId: string | null;
}>;

// Fixed observational strings from the private ingress, never authorization or SQL inputs.
// The transport that captures these remains a separately required integration premise.
export type M4AssignmentObservation = Readonly<{
  ip: string | null;
  userAgent: string | null;
}>;

export function staffResourceScope(actor: M4AssignmentActor, claimId: string) {
  return and(
    eq(claims.id, claimId),
    eq(claims.tenantId, actor.tenantId),
    actor.branchId === null
      ? or(eq(claims.staffId, actor.id), isNull(claims.staffId))
      : eq(claims.branchId, actor.branchId)
  );
}

export function assignmentSnapshotGuard(
  claim: Pick<
    typeof claims.$inferSelect,
    'staffId' | 'branchId' | 'caseLifecycleState' | 'recoveryLifecycleState'
  >
) {
  return and(
    claim.staffId === null ? isNull(claims.staffId) : eq(claims.staffId, claim.staffId),
    claim.branchId === null ? isNull(claims.branchId) : eq(claims.branchId, claim.branchId),
    eq(claims.caseLifecycleState, claim.caseLifecycleState),
    eq(claims.recoveryLifecycleState, claim.recoveryLifecycleState)
  );
}

export async function lockEligibleStaff(
  tx: TenantTransaction,
  tenantId: string,
  staffId: string,
  branchId: string | null
) {
  const [target] = await tx
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(
      and(
        eq(user.id, staffId),
        eq(user.tenantId, tenantId),
        eq(user.role, 'staff'),
        branchId === null ? undefined : eq(user.branchId, branchId)
      )
    )
    .limit(1)
    .for('share');
  return target;
}

export async function insertAssignmentAudit(
  tx: TenantTransaction,
  actor: M4AssignmentActor,
  claimId: string,
  previousStaffId: string | null,
  nextStaffId: string | null,
  observation: M4AssignmentObservation
) {
  await tx.insert(auditLog).values({
    id: nanoid(),
    tenantId: actor.tenantId,
    actorId: actor.id,
    actorRole: actor.role,
    action: nextStaffId ? 'claim.assigned' : 'claim.unassigned',
    entityType: 'claim',
    entityId: claimId,
    metadata: {
      previousStaffId,
      newStaffId: nextStaffId,
      ...(observation.ip === null ? {} : { ip: observation.ip.slice(0, 256) }),
      ...(observation.userAgent === null
        ? {}
        : { userAgent: observation.userAgent.slice(0, 1024) }),
      requestObservation: {
        provenance: 'web-relay-reported',
        authoritative: false,
        ipTruncated: (observation.ip?.length ?? 0) > 256,
        userAgentTruncated: (observation.userAgent?.length ?? 0) > 1024,
      },
    },
    createdAt: new Date(),
  });
}
