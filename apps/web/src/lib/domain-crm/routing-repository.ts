import type {
  CrmRoutingRepository,
  CrmRoutingAssignmentAuditRecord,
  CrmRoutingCursorAdvanceResult,
  CrmRoutingRule,
  CrmRoutingStrategy,
} from '@interdomestik/domain-crm/routing';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';

import { db } from '@interdomestik/database/db';
import {
  crmRoutingAssignmentsAudit,
  crmRoutingCursors,
  crmRoutingRules,
} from '@interdomestik/database/schema';

type CrmRoutingDb = typeof db;
type CrmRoutingRuleRow = typeof crmRoutingRules.$inferSelect;
type CrmRoutingAssignmentAuditRow = typeof crmRoutingAssignmentsAudit.$inferSelect;

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapRule(row: CrmRoutingRuleRow): CrmRoutingRule {
  return {
    agentIds: row.agentPool,
    branchId: row.branchId ?? null,
    effectiveFrom: toIso(row.effectiveFrom),
    effectiveTo: toIso(row.effectiveTo),
    enabled: row.enabled,
    fallbackAgentId: row.fallbackAgentId ?? null,
    fallbackRuleId: row.fallbackRuleId ?? null,
    id: row.id,
    leadType: row.leadType ?? null,
    maxNewLeadsPerAgentPerDay: row.maxNewLeadsPerAgentPerDay ?? null,
    maxOpenLeadsPerAgent: row.maxOpenLeadsPerAgent ?? null,
    priority: row.priority,
    source: row.source ?? null,
    strategy: row.strategy as CrmRoutingStrategy,
    tenantId: row.tenantId,
    utmCampaign: row.utmCampaign ?? null,
    utmMedium: row.utmMedium ?? null,
    utmSource: row.utmSource ?? null,
  };
}

function mapAudit(row: CrmRoutingAssignmentAuditRow): CrmRoutingAssignmentAuditRecord {
  if (!row.actorId || !row.selectedAgentId) {
    throw new Error('CRM routing audit row is missing assignment actor or selected agent');
  }
  const occurredAt = toIso(row.occurredAt);
  if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) {
    throw new Error('CRM routing audit row is missing a valid occurrence timestamp');
  }

  return {
    actorId: row.actorId,
    agentId: row.selectedAgentId,
    branchId: row.branchId ?? null,
    idempotencyKey: row.idempotencyKey ?? null,
    leadId: row.leadId,
    occurredAt,
    reasonCode: row.reasonCode as CrmRoutingAssignmentAuditRecord['reasonCode'],
    ruleId: row.ruleId,
    strategy: row.strategy as CrmRoutingStrategy,
    tenantId: row.tenantId,
  };
}

function auditValues(params: {
  auditRecord: CrmRoutingAssignmentAuditRecord;
  idempotencyKey?: string | null;
}) {
  const idempotencyKey = params.idempotencyKey ?? params.auditRecord.idempotencyKey ?? null;

  return {
    actorId: params.auditRecord.actorId,
    branchId: params.auditRecord.branchId ?? null,
    id: randomUUID(),
    idempotencyKey,
    leadId: params.auditRecord.leadId,
    occurredAt: new Date(params.auditRecord.occurredAt),
    reasonCode: params.auditRecord.reasonCode,
    ruleId: params.auditRecord.ruleId,
    selectedAgentId: params.auditRecord.agentId,
    strategy: params.auditRecord.strategy,
    tenantId: params.auditRecord.tenantId,
  };
}

export function createCrmRoutingRepository(database: CrmRoutingDb = db): CrmRoutingRepository {
  return {
    async listRoutingRules(params: { actor: CrmActorContext }) {
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
        predicates.push(
          or(eq(crmRoutingRules.branchId, branchId), isNull(crmRoutingRules.branchId))!
        );
      }

      // db-access-guard: tenant-scoped -- reason: CRM routing rule reads constrain by authorized actor tenant and branch scope when present
      const rows = await database.query.crmRoutingRules.findMany({
        orderBy: [asc(crmRoutingRules.priority), asc(crmRoutingRules.id)],
        where: and(...predicates),
      });

      return rows.map(mapRule);
    },

    async advanceRoutingCursor(params): Promise<CrmRoutingCursorAdvanceResult> {
      const now = new Date();
      const idempotencyKey = params.idempotencyKey ?? null;
      const setValues = {
        cursorValue: params.advancement.nextCursor,
        lastIdempotencyKey: idempotencyKey,
        updatedAt: now,
      };

      // db-access-guard: tenant-scoped -- reason: routing cursor compare-and-swap constrains by explicit tenantId, ruleId, and prior cursor from the routing decision
      const rows =
        params.advancement.priorCursor === null
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
                  eq(crmRoutingCursors.cursorValue, params.advancement.priorCursor)
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
    },

    async appendRoutingAssignmentAudit(params) {
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
        return mapAudit(inserted[0]);
      }

      if (!values.idempotencyKey) {
        throw new Error('CRM routing audit append conflicted without an idempotency key');
      }

      // db-access-guard: tenant-scoped -- reason: idempotent routing assignment audit lookup constrains by tenant plus non-null idempotency key
      const existing = await database.query.crmRoutingAssignmentsAudit.findFirst({
        where: and(
          eq(crmRoutingAssignmentsAudit.tenantId, values.tenantId),
          eq(crmRoutingAssignmentsAudit.idempotencyKey, values.idempotencyKey)
        ),
      });

      if (!existing) {
        throw new Error('CRM routing audit idempotency conflict did not return an existing row');
      }

      return mapAudit(existing);
    },
  };
}

export const crmRoutingRepository = createCrmRoutingRepository();
