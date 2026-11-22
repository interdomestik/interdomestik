import { reportServerError } from '@interdomestik/domain-communications/server-error';
import { claims, eq, type TenantTransaction } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import {
  enqueueClaimStatusNotification,
  lockClaimNotificationRecipient,
} from '@interdomestik/domain-communications/notification-deliveries';
import type { SQL } from 'drizzle-orm';
import { z } from 'zod';

import { buildScopedStaffClaimWhere } from '../staff-claims/scope';
import { RECOVERY_DECLINE_REASON_CODES } from '../staff-claims/types';
import { claimStatusSchema } from '../validators/claims';
import { lockClaimStatusAgreement } from './change-status-agreement';
import {
  checkClaimStatusRecovery,
  isRecoveryStatus,
  lockRecoveryAllowanceBeforeClaim,
  matchesRecoveryAllowanceLock,
  type RecoveryPrerequisite,
  type RecoveryUsage,
} from './change-status-recovery';
import { persistClaimStatusChange } from './change-status-write';
import { needsRecoveryInvariantEvidence } from './recovery-invariants';
import { answerClaimResponseRequests } from './response-requests';
import { resolveClaimStatusActor, type ClaimStatusActor } from './status-actor';
import {
  authorizeClaimTransitionInTransaction,
  ClaimTransitionConflictError,
  type AuthorizeClaimTransitionResult,
} from './transition';
import {
  isValidTransitionCurrentState,
  resolveTransitionCurrentState,
} from './transition-current-state';
import type { ClaimTransitionRejectionReason } from './transition-guard';

export { activateClaimStatusAuditProjection } from './audit-projection';
export { resolveClaimStatusActor } from './status-actor';

export const changeClaimStatusInputSchema = z
  .object({
    claimId: z.string().trim().min(1),
    toStatus: claimStatusSchema.shape.status,
    note: z.string().trim().max(2000).optional(),
    isPublicNote: z.boolean().default(true),
    declineReasonCode: z.enum(RECOVERY_DECLINE_REASON_CODES).optional(),
    decisionExplanation: z.string().trim().optional(),
    allowanceOverrideReason: z.string().trim().optional(),
  })
  .strict();

export type ChangeClaimStatusCode =
  | 'not_found'
  | 'forbidden_role'
  | 'invalid_input'
  | 'invalid_current_status'
  | 'draft_not_changeable'
  | 'illegal_transition'
  | 'decline_reason_required'
  | `recovery_prerequisite:${RecoveryPrerequisite}`
  | `transition_rejected:${Exclude<ClaimTransitionRejectionReason, 'invalid_status' | 'illegal_transition'>}`
  | 'conflict'
  | 'transaction_failed';

export type ChangeClaimStatusResult =
  | {
      ok: true;
      fromStatus: ClaimStatus;
      toStatus: ClaimStatus;
      changed: boolean;
      deliveryIds: string[];
    }
  | { ok: false; code: ChangeClaimStatusCode };

type StatusInput = z.output<typeof changeClaimStatusInputSchema>;
type StatusMeta = { hostId: string | null; requestHeaders?: Headers };

class ClaimStatusFailure extends Error {
  constructor(readonly code: ChangeClaimStatusCode) {
    super(code);
    this.name = 'ClaimStatusFailure';
  }
}

function transitionFailure(
  result: Extract<AuthorizeClaimTransitionResult, { success: false }>
): ChangeClaimStatusCode {
  if (result.error === 'claim_not_found') return 'not_found';
  if (result.error === 'invalid_current_status' || result.reason === 'invalid_status') {
    return 'invalid_current_status';
  }
  if (result.reason === 'illegal_transition') return result.reason;
  return `transition_rejected:${result.reason}`;
}

async function lockClaim(tx: TenantTransaction, scope: SQL) {
  const [row] = await tx
    .select({
      caseLifecycleState: claims.caseLifecycleState,
      category: claims.category,
      lifecycleVersion: claims.lifecycleVersion,
      recoveryLifecycleState: claims.recoveryLifecycleState,
      staffId: claims.staffId,
      title: claims.title,
      userId: claims.userId,
    })
    .from(claims)
    .where(scope)
    .limit(1)
    .for('no key update');
  if (!row) throw new ClaimStatusFailure('not_found');

  const current = resolveTransitionCurrentState(row);
  if (!isValidTransitionCurrentState(current))
    throw new ClaimStatusFailure('invalid_current_status');
  if (current.status === 'draft') throw new ClaimStatusFailure('draft_not_changeable');
  return { row, current };
}

async function changeClaimStatusInTransaction(
  tx: TenantTransaction,
  actor: ClaimStatusActor,
  input: StatusInput,
  meta: StatusMeta
): Promise<ChangeClaimStatusResult> {
  const { tenantId } = actor;
  const { claimId, toStatus, isPublicNote, declineReasonCode } = input;
  const scope =
    actor.kind === 'staff'
      ? buildScopedStaffClaimWhere({
          tenantId,
          claimId,
          userId: actor.id,
          branchId: actor.branchId,
        })
      : withTenant(tenantId, claims.tenantId, eq(claims.id, claimId));

  const recoveryTarget = isRecoveryStatus(toStatus);
  const allowanceSnapshot = recoveryTarget
    ? await lockRecoveryAllowanceBeforeClaim(tx, tenantId, scope)
    : undefined;
  const { row, current } = await lockClaim(tx, scope);
  if (
    recoveryTarget &&
    !(await matchesRecoveryAllowanceLock(tx, tenantId, row.userId, allowanceSnapshot))
  ) {
    throw new ClaimStatusFailure('conflict');
  }
  const fromStatus = current.status;
  const changed = fromStatus !== toStatus;
  const unchanged = { ok: true as const, changed: false, fromStatus, toStatus, deliveryIds: [] };
  const note = input.note || null;
  if (!changed && !note) return unchanged;

  let decline = null;
  if (changed && toStatus === 'rejected') {
    if (!declineReasonCode) throw new ClaimStatusFailure('decline_reason_required');
    decline = { code: declineReasonCode, explanation: input.decisionExplanation };
  }

  const agreement =
    (changed && needsRecoveryInvariantEvidence(toStatus)) || (isPublicNote && note && !decline)
      ? await lockClaimStatusAgreement(tx, tenantId, claimId)
      : undefined;
  let usage: RecoveryUsage | null = null;
  if (changed && recoveryTarget) {
    const recovery = await checkClaimStatusRecovery(tx, {
      agreement,
      allowanceSnapshot,
      category: row.category,
      claimId,
      overrideReason: input.allowanceOverrideReason,
      tenantId,
      userId: row.userId,
    });
    if (!recovery.ok) throw new ClaimStatusFailure(recovery.code);
    usage = recovery.usage;
  }

  const authorized = await authorizeClaimTransitionInTransaction(
    tx,
    {
      actor: { id: actor.id, role: actor.kind === 'staff' ? 'staff' : actor.role },
      claimId,
      hostId: meta.hostId,
      isPublic: isPublicNote,
      note,
      requiredWhereCondition: scope,
      tenantId,
      toStatus,
    },
    { current, agreement }
  );
  if (!authorized.success) throw new ClaimStatusFailure(transitionFailure(authorized));

  const recipient = changed ? await lockClaimNotificationRecipient(tx, tenantId, row.userId) : null;
  const lifecycleVersion = await persistClaimStatusChange(tx, scope, {
    transition: authorized.transition,
    previousStaffId: row.staffId,
    decline,
    decision: agreement,
    usage,
    requestHeaders: meta.requestHeaders,
  });
  if (!changed) return unchanged;

  const deliveryIds = recipient
    ? await enqueueClaimStatusNotification(tx, {
        tenantId,
        claimId,
        recipient,
        title: row.title,
        fromStatus,
        toStatus,
        lifecycleVersion,
      })
    : [];
  await answerClaimResponseRequests(tx, {
    tenantId,
    claimId,
    actorId: actor.id,
    kind: 'status_change',
  });

  return { ok: true, fromStatus, toStatus, changed, deliveryIds };
}

export async function changeClaimStatus(
  authority: TenantAuthority,
  input: unknown,
  meta: StatusMeta
): Promise<ChangeClaimStatusResult> {
  let actor: ClaimStatusActor | null;
  try {
    actor = resolveClaimStatusActor(authority);
  } catch {
    return { ok: false, code: 'forbidden_role' };
  }
  if (!actor) return { ok: false, code: 'forbidden_role' };

  const parsed = changeClaimStatusInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid_input' };
  if (
    actor.kind === 'admin' &&
    (!parsed.data.isPublicNote || parsed.data.allowanceOverrideReason !== undefined)
  ) {
    return { ok: false, code: 'forbidden_role' };
  }

  try {
    return await withTenantAuthority(authority, tx =>
      changeClaimStatusInTransaction(tx, actor, parsed.data, meta)
    );
  } catch (error) {
    if (error instanceof ClaimStatusFailure) return { ok: false, code: error.code };
    if (error instanceof ClaimTransitionConflictError) return { ok: false, code: 'conflict' };
    reportServerError('Claim status transaction failed', error);
    return { ok: false, code: 'transaction_failed' };
  }
}
