import * as schema from '@interdomestik/database/schema';
import { isSuperAdmin, isTenantAdmin } from '@interdomestik/shared-auth';
import { and, eq, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import { assignClaimOwnerInTransaction } from '../../features/admin/claims/actions/ops-assignment';
import { OpsDomainDenialError } from '../../features/admin/claims/actions/ops-action-outcome';
import type {
  Configuration,
  LegacyConfiguration,
  Profile,
  OpsExecutor,
  ProfileExecutor,
  OpsResponse,
} from './m4-assignment-controller-types';
import { parseM4AssignmentRequest } from './m4-assignment-protocol';
import { staffResourceScope } from './m4-assignment-kernel-shared';
import {
  assignLegacyAdminInTransaction,
  assignLegacyAgentInTransaction,
} from './m4-legacy-assignment-kernel';
import { assignStaffInTransaction } from './m4-staff-assignment-kernel';
import type {
  InitialCommittedAssignmentNotification,
  M4AssignmentPostcommitNotifier,
} from './m4-assignment-postcommit';
import {
  opsSuccess,
  parseM4AssignmentObservation,
  profileResult,
  storedOpsResult,
  storedProfileOutcome,
  type AssignmentResult,
  type LegacyResult,
  type M4Response,
  type StaffResult,
} from './m4-assignment-wire';

export type M4OpsResponse = OpsResponse;

export function createM4OpsAssignmentController(configuration: Configuration): OpsExecutor {
  return createPrivateAssignmentController(configuration, 'ops') as OpsExecutor;
}
export function createM4LegacyAdminAssignmentController(
  configuration: LegacyConfiguration
): ProfileExecutor<LegacyResult> {
  return createPrivateAssignmentController(
    configuration,
    'legacy-admin',
    configuration.assignmentNotifier
  ) as ProfileExecutor<LegacyResult>;
}
export function createM4LegacyAgentAssignmentController(
  configuration: LegacyConfiguration
): ProfileExecutor<LegacyResult> {
  return createPrivateAssignmentController(
    configuration,
    'legacy-agent',
    configuration.assignmentNotifier
  ) as ProfileExecutor<LegacyResult>;
}
export function createM4StaffAssignmentController(
  configuration: Configuration
): ProfileExecutor<StaffResult> {
  return createPrivateAssignmentController(configuration, 'staff') as ProfileExecutor<StaffResult>;
}

// The literal private bootstrap supplies the profile and concrete legacy notifier instance.
// Actual notifier/purpose-pool/source qualification remains separate; no request callback exists.
function createPrivateAssignmentController(
  configuration: Configuration,
  profile: Profile,
  assignmentNotifier?: M4AssignmentPostcommitNotifier
) {
  if (
    (profile === 'legacy-admin' || profile === 'legacy-agent') &&
    typeof assignmentNotifier !== 'function'
  )
    throw new Error('Missing private assignment notifier');
  const { database, verifySession } = configuration;
  return async function execute(
    cookie: unknown,
    serialized: unknown,
    serializedObservation?: unknown
  ): Promise<M4Response<AssignmentResult>> {
    const request = parseM4AssignmentRequest(serialized);
    if (
      !request ||
      (profile === 'ops'
        ? request.command !== 'm4.ops.assign-owner'
        : profile === 'staff'
          ? request.command !== 'm4.staff.assign-claim'
          : request.command !== 'm4.legacy.assign-claim')
    )
      return { status: 'denied', reason: 'INVALID_REQUEST' };
    const observation =
      profile === 'ops' ? undefined : parseM4AssignmentObservation(serializedObservation);
    if (profile !== 'ops' && !observation) return { status: 'denied', reason: 'INVALID_REQUEST' };
    let notification: InitialCommittedAssignmentNotification | undefined;
    try {
      const response = await database.transaction(async tx => {
        const principal = await verifySession(cookie);
        if (!principal) return { status: 'denied' as const, reason: 'UNAUTHORIZED' as const };
        await tx.execute(sql`select 1 / case when exists (
          select 1 from pg_catalog.pg_roles where rolname=session_user and not rolsuper and not rolbypassrls
        ) and session_user=current_user then 1 else 0 end as restricted_role`);
        await tx.execute(sql`set local row_security = on`);
        await tx.execute(sql`select set_config('app.current_tenant_id', ${principal.tenantId}, true),
          set_config('app.current_access_tenant_id', ${principal.accessTenantId}, true)`);
        const [actor] = await tx
          .select({ id: schema.user.id, role: schema.user.role, branchId: schema.user.branchId })
          .from(schema.user)
          .where(
            and(eq(schema.user.id, principal.actorId), eq(schema.user.tenantId, principal.tenantId))
          )
          .limit(1)
          .for('share');
        if (
          !actor ||
          (profile === 'ops'
            ? !(isTenantAdmin(actor.role) || isSuperAdmin(actor.role))
            : profile === 'staff'
              ? actor.role !== 'staff'
              : actor.role !== 'staff' && actor.role !== 'admin')
        )
          return { status: 'denied' as const, reason: 'UNAUTHORIZED' as const };
        await tx.execute(sql`select set_config('app.user_role', ${actor.role}, true)`);
        const staffId =
          profile === 'ops'
            ? request.staffId!.trim()
            : profile === 'staff' && request.staffId === undefined
              ? actor.id
              : request.staffId!;
        // A formerly-admin actor cannot replay another-target legacy assignment after losing
        // that privilege. This current authority refusal is not a newly completed domain result.
        if (
          (profile === 'legacy-admin' || profile === 'legacy-agent') &&
          actor.role === 'staff' &&
          staffId &&
          staffId !== actor.id
        )
          return { status: 'denied' as const, reason: 'SELF_ASSIGNMENT_ONLY' as const };
        const currentActor = {
          id: actor.id,
          role: actor.role,
          tenantId: principal.accessTenantId,
          branchId: actor.branchId ?? null,
        };
        const [claim] = await tx
          .select({ id: schema.claims.id })
          .from(schema.claims)
          .where(
            and(
              eq(schema.claims.id, request.claimId),
              eq(schema.claims.tenantId, principal.accessTenantId),
              profile === 'legacy-admin'
                ? eq(schema.claims.tenantId, principal.tenantId)
                : undefined,
              profile !== 'ops' && actor.role === 'staff'
                ? staffResourceScope(currentActor, request.claimId)
                : undefined
            )
          )
          .limit(1)
          .for('update');
        if (!claim) return { status: 'denied' as const, reason: 'RESOURCE_DENIED' as const };
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${request.operationId}, 0))`
        );
        const fingerprint = createHash('sha256')
          .update(
            JSON.stringify([
              request.version,
              request.command,
              actor.id,
              principal.accessTenantId,
              request.claimId,
              staffId,
              ...(profile === 'ops' ? [] : [profile]),
            ])
          )
          .digest('hex');
        const [previous] = await tx
          .select()
          .from(schema.operationResults)
          .where(eq(schema.operationResults.operationId, request.operationId))
          .limit(1);
        if (previous) {
          if (
            previous.actorId !== actor.id ||
            previous.tenantId !== principal.accessTenantId ||
            previous.command !== request.command ||
            previous.version !== request.version ||
            previous.claimId !== request.claimId ||
            previous.requestFingerprint !== fingerprint
          )
            return { status: 'denied' as const, reason: 'OPERATION_CONFLICT' as const };
          if (profile === 'ops')
            return {
              status: 'completed' as const,
              operationId: request.operationId,
              replayed: true,
              result: storedOpsResult(previous.response, request.claimId, staffId as string),
            };
          const stored = storedProfileOutcome(previous.response, profile !== 'staff');
          return {
            status: 'completed' as const,
            operationId: request.operationId,
            replayed: true,
            result: stored.result,
            changed: stored.changed,
          };
        }
        let result: AssignmentResult;
        let changed = false;
        if (profile === 'ops') {
          try {
            const assignedOps =
              !staffId || staffId === actor.id
                ? { success: false as const, error: 'Staff member not found or out of scope' }
                : await assignClaimOwnerInTransaction(tx, {
                    actorId: actor.id,
                    actorRole: actor.role,
                    tenantId: principal.accessTenantId,
                    claimId: request.claimId,
                    staffId,
                  });
            result = assignedOps.success
              ? opsSuccess(assignedOps, request.claimId, staffId as string)
              : assignedOps;
          } catch (error) {
            if (!(error instanceof OpsDomainDenialError)) throw error;
            result = { success: false, error: error.message };
          }
        } else {
          const input = {
            actor: currentActor,
            claimId: request.claimId,
            staffId,
            observation: observation!,
          };
          if (profile === 'staff') {
            const assignedStaff = await assignStaffInTransaction(tx, input);
            result = profileResult(assignedStaff.result, false);
            changed = assignedStaff.changed;
          } else {
            const assignedLegacy =
              profile === 'legacy-admin'
                ? await assignLegacyAdminInTransaction(tx, input)
                : await assignLegacyAgentInTransaction(tx, input);
            result = profileResult(assignedLegacy.result, true);
            changed = assignedLegacy.changed;
            if (assignedLegacy.notification)
              notification = {
                operationId: request.operationId,
                actorId: actor.id,
                tenantId: principal.accessTenantId,
                staffId: assignedLegacy.notification.staffId,
                claimId: request.claimId,
                entry: profile,
              };
          }
        }
        await tx.insert(schema.operationResults).values({
          operationId: request.operationId,
          tenantId: principal.accessTenantId,
          actorId: actor.id,
          claimId: request.claimId,
          command: request.command,
          version: request.version,
          requestFingerprint: fingerprint,
          response: profile === 'ops' ? result : { result, changed },
        });
        return {
          status: 'completed' as const,
          operationId: request.operationId,
          replayed: false,
          result,
          ...(profile === 'ops' ? {} : { changed }),
        };
      });
      // Only after successful commit, only the initial call, independent best-effort failure.
      // No replay, failed commit, domain denial or staff/ops call receives notification data.
      if (
        response.status === 'completed' &&
        !response.replayed &&
        response.result.success &&
        notification
      ) {
        const committedNotification = notification;
        void Promise.resolve()
          .then(() => assignmentNotifier!(committedNotification))
          .catch(() => console.error('Failed to notify assignment'));
      }
      return response;
    } catch {
      return { status: 'indeterminate', operationId: request.operationId };
    }
  };
}
