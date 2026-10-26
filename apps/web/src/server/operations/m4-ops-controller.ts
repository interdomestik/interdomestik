import * as schema from '@interdomestik/database/schema';
import { and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { createHash } from 'node:crypto';

import { assignClaimOwnerInTransaction } from '../../features/admin/claims/actions/ops-assignment';
import { OpsDomainDenialError } from '../../features/admin/claims/actions/ops-action-outcome';
import type { CurrentOperationPrincipal } from '../../lib/auth/current-store-session';
import { parseM4AssignmentRequest } from './m4-assignment-protocol';

type AssignmentSuccess = {
  success: true;
  data: { id: string; staffId: string; assignedAt: string };
};
type AssignmentResult = AssignmentSuccess | { success: false; error: string };
export type M4OpsResponse =
  | { status: 'completed'; operationId: string; replayed: boolean; result: AssignmentResult }
  | {
      status: 'denied';
      reason: 'INVALID_REQUEST' | 'UNAUTHORIZED' | 'RESOURCE_DENIED' | 'OPERATION_CONFLICT';
    }
  | { status: 'indeterminate'; operationId: string };

type Configuration = {
  database: PostgresJsDatabase<typeof schema>;
  verifySession: (cookie: unknown) => Promise<CurrentOperationPrincipal | null>;
};

function successResult(value: unknown, claimId: string, staffId: string): AssignmentSuccess {
  if (!value || typeof value !== 'object') throw new Error('Invalid operation result');
  const row = value as Record<string, unknown>;
  if (row.success !== true || !row.data || typeof row.data !== 'object')
    throw new Error('Invalid operation result');
  const data = row.data as Record<string, unknown>;
  const assignedAt =
    data.assignedAt instanceof Date ? data.assignedAt.toISOString() : data.assignedAt;
  if (
    data.id !== claimId ||
    data.staffId !== staffId ||
    typeof assignedAt !== 'string' ||
    !Number.isFinite(Date.parse(assignedAt))
  )
    throw new Error('Invalid operation result');
  return { success: true, data: { id: data.id, staffId: data.staffId, assignedAt } };
}

function storedResult(value: unknown, claimId: string, staffId: string): AssignmentResult {
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    if (
      row.success === false &&
      typeof row.error === 'string' &&
      row.error.length > 0 &&
      row.error.length <= 512
    )
      return { success: false, error: row.error };
  }
  return successResult(value, claimId, staffId);
}

// Only the private backend entry constructs this closure with its actual A1 verifier and data
// pool. No transaction, callback, client, verified-session DTO or generic dispatcher is exposed.
// Complete driver/pool/ingress qualification remains required before mounting this controller.
export function createM4OpsAssignmentController(configuration: Configuration) {
  const { database, verifySession } = configuration;
  return async function execute(cookie: unknown, serialized: unknown): Promise<M4OpsResponse> {
    const request = parseM4AssignmentRequest(serialized);
    if (!request || request.command !== 'm4.ops.assign-owner')
      return { status: 'denied', reason: 'INVALID_REQUEST' };
    try {
      return await database.transaction(async tx => {
        // Admission follows acquisition of this transaction, so pool-queued work does not use a
        // principal obtained before its turn. A later session revocation blocks the next admission.
        const principal = await verifySession(cookie);
        if (!principal) return { status: 'denied', reason: 'UNAUTHORIZED' };
        await tx.execute(sql`select 1 / case when exists (
          select 1 from pg_catalog.pg_roles where rolname=session_user and not rolsuper and not rolbypassrls
        ) and session_user=current_user then 1 else 0 end as restricted_role`);
        await tx.execute(sql`set local row_security = on`);
        await tx.execute(sql`select set_config('app.current_tenant_id', ${principal.tenantId}, true),
          set_config('app.current_access_tenant_id', ${principal.accessTenantId}, true)`);
        const [actor] = await tx
          .select({ id: schema.user.id, role: schema.user.role })
          .from(schema.user)
          .where(
            and(eq(schema.user.id, principal.actorId), eq(schema.user.tenantId, principal.tenantId))
          )
          .limit(1)
          .for('share');
        if (!actor || !['admin', 'tenant_admin', 'super_admin'].includes(actor.role))
          return { status: 'denied', reason: 'UNAUTHORIZED' };
        await tx.execute(sql`select set_config('app.user_role', ${actor.role}, true)`);
        const staffId = request.staffId!.trim();
        // Reconciliation still requires present actor/resource authorization. Historical results
        // are never returned merely because the caller knows an operation UUID.
        const [claim] = await tx
          .select({ id: schema.claims.id })
          .from(schema.claims)
          .where(
            and(
              eq(schema.claims.id, request.claimId),
              eq(schema.claims.tenantId, principal.accessTenantId)
            )
          )
          .limit(1)
          .for('update');
        if (!claim) return { status: 'denied', reason: 'RESOURCE_DENIED' };
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
            return { status: 'denied', reason: 'OPERATION_CONFLICT' };
          return {
            status: 'completed',
            operationId: request.operationId,
            replayed: true,
            result: storedResult(previous.response, request.claimId, staffId),
          };
        }
        let result: AssignmentResult;
        try {
          const assigned =
            !staffId || staffId === actor.id
              ? { success: false as const, error: 'Staff member not found or out of scope' }
              : await assignClaimOwnerInTransaction(tx, {
                  actorId: actor.id,
                  actorRole: actor.role,
                  tenantId: principal.accessTenantId,
                  claimId: request.claimId,
                  staffId,
                });
          result = assigned.success ? successResult(assigned, request.claimId, staffId) : assigned;
        } catch (error) {
          if (!(error instanceof OpsDomainDenialError)) throw error;
          result = { success: false, error: error.message };
        }
        // Completed denials also bind this identity: a changed payload must never turn a
        // previously completed operation into a new write under the same operation UUID.
        await tx.insert(schema.operationResults).values({
          operationId: request.operationId,
          tenantId: principal.accessTenantId,
          actorId: actor.id,
          claimId: request.claimId,
          command: request.command,
          version: request.version,
          requestFingerprint: fingerprint,
          response: result,
        });
        return { status: 'completed', operationId: request.operationId, replayed: false, result };
      });
    } catch {
      // A lost connection/response is not proof of rollback or non-dispatch. Reconcile this same
      // identity after fresh admission; never automatically resubmit under a fresh operation ID.
      return { status: 'indeterminate', operationId: request.operationId };
    }
  };
}
