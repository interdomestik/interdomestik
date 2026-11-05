import type {
  CrmRoutingCursorAdvanceResult,
  CrmRoutingRepository,
} from '@interdomestik/domain-crm/routing';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';

import {
  crmRoutingAssignmentsAudit,
  crmRoutingCursors,
  crmRoutingRules,
} from '@interdomestik/database/schema';

import { auditValues, mapAudit, mapRule } from './routing-row-mapping';
import type { CrmTenantExecutor } from './tenant-runner';

// CRM routing persistence as functions of one tenant transaction. The routing repository runs each
// in its own tenant transaction; the routing application coordinator runs them all in one.

type RoutingParams<K extends keyof CrmRoutingRepository> = Parameters<CrmRoutingRepository[K]>[0];

export async function findRoutingAuditByIdempotencyInDatabase(
  database: CrmTenantExecutor,
  params: RoutingParams<'findRoutingAssignmentAuditByIdempotency'>
) {
  // db-access-guard: tenant-scoped -- reason: routing application idempotency replay constrains by explicit tenantId and opaque idempotency key
  const existing = await database.query.crmRoutingAssignmentsAudit.findFirst({
    where: and(
      eq(crmRoutingAssignmentsAudit.tenantId, params.tenantId),
      eq(crmRoutingAssignmentsAudit.idempotencyKey, params.idempotencyKey)
    ),
  });
  return existing ? mapAudit(existing) : null;
}

export async function listRoutingRulesInDatabase(
  database: CrmTenantExecutor,
  params: { actor: CrmActorContext }
) {
  const actor = params.actor;
  if (actor.role === 'member') return [];
  if ((actor.role === 'agent' || actor.role === 'branch_manager') && !actor.scope.branchId) {
    return [];
  }

  const predicates = [
    eq(crmRoutingRules.tenantId, actor.tenantId),
    eq(crmRoutingRules.enabled, true),
    isNull(crmRoutingRules.archivedAt),
  ];

  if (actor.role === 'agent' || actor.role === 'branch_manager') {
    const branchId = actor.scope.branchId;
    if (!branchId) return [];
    predicates.push(or(eq(crmRoutingRules.branchId, branchId), isNull(crmRoutingRules.branchId))!);
  }

  // db-access-guard: tenant-scoped -- reason: CRM routing rule reads constrain by authorized actor tenant and branch scope when present
  const rows = await database.query.crmRoutingRules.findMany({
    orderBy: [asc(crmRoutingRules.priority), asc(crmRoutingRules.id)],
    where: and(...predicates),
  });

  return rows.map(mapRule);
}

export async function advanceRoutingCursorInDatabase(
  database: CrmTenantExecutor,
  params: RoutingParams<'advanceRoutingCursor'>
): Promise<CrmRoutingCursorAdvanceResult> {
  const now = new Date();
  const idempotencyKey = params.idempotencyKey ?? null;
  const setValues = {
    cursorValue: params.advancement.nextCursor,
    lastIdempotencyKey: idempotencyKey,
    updatedAt: now,
  };

  // db-access-guard: tenant-scoped -- reason: routing cursor compare-and-swap constrains by explicit tenantId, ruleId, and prior cursor from the routing decision
  const priorCursor = params.advancement.priorCursor;
  const rows =
    priorCursor === null
      ? await database
          .insert(crmRoutingCursors)
          .values({
            ...setValues,
            ruleId: params.advancement.ruleId,
            tenantId: params.advancement.tenantId,
          })
          .onConflictDoNothing({
            target: [crmRoutingCursors.tenantId, crmRoutingCursors.ruleId],
          })
          .returning()
      : await database
          .update(crmRoutingCursors)
          .set(setValues)
          .where(
            and(
              eq(crmRoutingCursors.tenantId, params.advancement.tenantId),
              eq(crmRoutingCursors.ruleId, params.advancement.ruleId),
              eq(crmRoutingCursors.cursorValue, priorCursor)
            )
          )
          .returning();

  if (rows[0]) {
    return { advancement: params.advancement, success: true };
  }

  if (idempotencyKey) {
    // db-access-guard: tenant-scoped -- reason: idempotent cursor retry lookup constrains by tenant, rule, expected cursor, and idempotency key
    const existing = await database.query.crmRoutingCursors.findFirst({
      where: and(
        eq(crmRoutingCursors.tenantId, params.advancement.tenantId),
        eq(crmRoutingCursors.ruleId, params.advancement.ruleId),
        eq(crmRoutingCursors.cursorValue, params.advancement.nextCursor),
        eq(crmRoutingCursors.lastIdempotencyKey, idempotencyKey)
      ),
    });

    if (existing) {
      return { advancement: params.advancement, success: true };
    }
  }

  return { reason: 'cursor_conflict', success: false };
}

export async function appendRoutingAuditInDatabase(
  database: CrmTenantExecutor,
  params: RoutingParams<'appendRoutingAssignmentAudit'>
) {
  const values = auditValues(params);

  // db-access-guard: tenant-scoped -- reason: routing assignment audit copies explicit tenantId from the CRM07 audit record and uses tenant-scoped idempotency
  const inserted = await database
    .insert(crmRoutingAssignmentsAudit)
    .values(values)
    .onConflictDoNothing({
      target: [crmRoutingAssignmentsAudit.tenantId, crmRoutingAssignmentsAudit.idempotencyKey],
      where: sql`${crmRoutingAssignmentsAudit.idempotencyKey} is not null`,
    })
    .returning();

  if (inserted[0]) {
    return { auditRecord: mapAudit(inserted[0]), status: 'appended' as const };
  }

  const auditIdempotencyKey = values.idempotencyKey;
  if (!auditIdempotencyKey) {
    throw new Error('CRM routing audit append conflicted without an idempotency key');
  }

  // db-access-guard: tenant-scoped -- reason: idempotent routing assignment audit lookup constrains by tenant plus non-null idempotency key
  const existing = await database.query.crmRoutingAssignmentsAudit.findFirst({
    where: and(
      eq(crmRoutingAssignmentsAudit.tenantId, values.tenantId),
      eq(crmRoutingAssignmentsAudit.idempotencyKey, auditIdempotencyKey)
    ),
  });

  if (!existing) {
    throw new Error('CRM routing audit idempotency conflict did not return an existing row');
  }

  return { auditRecord: mapAudit(existing), status: 'existing' as const };
}
