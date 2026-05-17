import type {
  CrmRoutingRepository,
  CrmRoutingAssignmentAuditRecord,
  CrmRoutingCursorAdvanceResult,
  CrmRoutingRule,
  CrmRoutingStrategy,
} from '@interdomestik/domain-crm/routing';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { db } from '@interdomestik/database/db';
import {
  branches,
  crmRoutingAssignmentsAudit,
  crmRoutingCursors,
  crmRoutingRules,
  user,
} from '@interdomestik/database/schema';

type CrmRoutingDb = typeof db;
type CrmRoutingRuleRow = typeof crmRoutingRules.$inferSelect;
type CrmRoutingAssignmentAuditRow = typeof crmRoutingAssignmentsAudit.$inferSelect;

export type AdminCrmRoutingRuleRow = CrmRoutingRule & {
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminCrmRoutingRuleWriteInput = {
  agentIds: readonly string[];
  branchId?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  enabled?: boolean;
  fallbackAgentId?: string | null;
  fallbackRuleId?: string | null;
  leadType?: string | null;
  maxNewLeadsPerAgentPerDay?: number | null;
  maxOpenLeadsPerAgent?: number | null;
  priority: number;
  source?: string | null;
  strategy: CrmRoutingStrategy;
  utmCampaign?: string | null;
  utmMedium?: string | null;
  utmSource?: string | null;
};

export type AdminCrmRoutingAgentScopeRow = {
  branchId: string | null;
  id: string;
  role: string;
  tenantId: string;
};

export type AdminCrmRoutingBranchRow = {
  id: string;
  label: string;
  tenantId: string;
};

export interface AdminCrmRoutingRuleAdminRepository {
  archiveRoutingRule(params: {
    actor: CrmActorContext;
    ruleId: string;
  }): Promise<AdminCrmRoutingRuleRow | null>;
  createRoutingRule(params: {
    actor: CrmActorContext;
    input: AdminCrmRoutingRuleWriteInput;
  }): Promise<AdminCrmRoutingRuleRow>;
  getRoutingRule(params: {
    actor: CrmActorContext;
    ruleId: string;
  }): Promise<AdminCrmRoutingRuleRow | null>;
  listAgentScopes(params: {
    agentIds: readonly string[];
    tenantId: string;
  }): Promise<readonly AdminCrmRoutingAgentScopeRow[]>;
  listBranches(params: { tenantId: string }): Promise<readonly AdminCrmRoutingBranchRow[]>;
  listRoutingRulesForAdmin(params: {
    actor: CrmActorContext;
  }): Promise<readonly AdminCrmRoutingRuleRow[]>;
  reorderRoutingRules(params: {
    actor: CrmActorContext;
    branchId?: string | null;
    ruleIds: readonly string[];
  }): Promise<readonly AdminCrmRoutingRuleRow[]>;
  setRoutingRuleEnabled(params: {
    actor: CrmActorContext;
    enabled: boolean;
    ruleId: string;
  }): Promise<AdminCrmRoutingRuleRow | null>;
  updateRoutingRule(params: {
    actor: CrmActorContext;
    expectedUpdatedAt: string;
    input: AdminCrmRoutingRuleWriteInput;
    ruleId: string;
  }): Promise<AdminCrmRoutingRuleRow | 'cursor_conflict' | null>;
}

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

function mapAdminRule(row: CrmRoutingRuleRow): AdminCrmRoutingRuleRow {
  return {
    ...mapRule(row),
    archivedAt: toIso(row.archivedAt),
    createdAt: toIso(row.createdAt) ?? '',
    updatedAt: toIso(row.updatedAt) ?? '',
  };
}

function nullableDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(value);
}

function ruleWriteValues(input: AdminCrmRoutingRuleWriteInput) {
  return {
    agentPool: [...input.agentIds],
    branchId: input.branchId ?? null,
    effectiveFrom: nullableDate(input.effectiveFrom),
    effectiveTo: nullableDate(input.effectiveTo),
    enabled: input.enabled ?? true,
    fallbackAgentId: input.fallbackAgentId ?? null,
    fallbackRuleId: input.fallbackRuleId ?? null,
    leadType: input.leadType ?? null,
    maxNewLeadsPerAgentPerDay: input.maxNewLeadsPerAgentPerDay ?? null,
    maxOpenLeadsPerAgent: input.maxOpenLeadsPerAgent ?? null,
    priority: input.priority,
    source: input.source ?? null,
    strategy: input.strategy,
    updatedAt: new Date(),
    utmCampaign: input.utmCampaign ?? null,
    utmMedium: input.utmMedium ?? null,
    utmSource: input.utmSource ?? null,
  };
}

function adminRulePredicates(actor: CrmActorContext, ruleId?: string) {
  const predicates = [eq(crmRoutingRules.tenantId, actor.tenantId)];
  if (ruleId) predicates.push(eq(crmRoutingRules.id, ruleId));
  return predicates;
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
    async findRoutingAssignmentAuditByIdempotency(params) {
      // db-access-guard: tenant-scoped -- reason: routing application idempotency replay constrains by explicit tenantId and opaque idempotency key
      const existing = await database.query.crmRoutingAssignmentsAudit.findFirst({
        where: and(
          eq(crmRoutingAssignmentsAudit.tenantId, params.tenantId),
          eq(crmRoutingAssignmentsAudit.idempotencyKey, params.idempotencyKey)
        ),
      });
      return existing ? mapAudit(existing) : null;
    },

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
        return { auditRecord: mapAudit(inserted[0]), status: 'appended' };
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

      return { auditRecord: mapAudit(existing), status: 'existing' };
    },
  };
}

export const crmRoutingRepository = createCrmRoutingRepository();

export function createAdminCrmRoutingRuleRepository(
  database: CrmRoutingDb = db
): AdminCrmRoutingRuleAdminRepository {
  async function getRoutingRule(params: {
    actor: CrmActorContext;
    ruleId: string;
  }): Promise<AdminCrmRoutingRuleRow | null> {
    // db-access-guard: tenant-scoped -- reason: CRM routing rule lookup constrains by session-derived tenant and rule ID
    const row = await database.query.crmRoutingRules.findFirst({
      where: and(...adminRulePredicates(params.actor, params.ruleId)),
    });
    return row ? mapAdminRule(row) : null;
  }

  return {
    async archiveRoutingRule(params) {
      // db-access-guard: tenant-scoped -- reason: CRM routing rule archive constrains by session-derived tenant and rule ID
      const rows = await database
        .update(crmRoutingRules)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(...adminRulePredicates(params.actor, params.ruleId)))
        .returning();
      return rows[0] ? mapAdminRule(rows[0]) : null;
    },

    async createRoutingRule(params) {
      const values = ruleWriteValues(params.input);
      // db-access-guard: tenant-scoped -- reason: CRM routing rule create derives tenant from authorized admin actor
      const rows = await database
        .insert(crmRoutingRules)
        .values({
          ...values,
          id: randomUUID(),
          tenantId: params.actor.tenantId,
        })
        .returning();
      if (!rows[0]) throw new Error('CRM routing rule create returned no row');
      return mapAdminRule(rows[0]);
    },

    getRoutingRule,

    async listAgentScopes(params) {
      if (params.agentIds.length === 0) return [];
      // db-access-guard: tenant-scoped -- reason: routing admin validation constrains agent lookup by session tenant and submitted agent IDs
      const rows = await database.query.user.findMany({
        columns: { branchId: true, id: true, role: true, tenantId: true },
        where: and(eq(user.tenantId, params.tenantId), inArray(user.id, [...params.agentIds])),
      });
      return rows.map(row => ({
        branchId: row.branchId ?? null,
        id: row.id,
        role: row.role,
        tenantId: row.tenantId,
      }));
    },

    async listBranches(params) {
      // db-access-guard: tenant-scoped -- reason: routing admin branch labels constrain by session tenant only
      const rows = await database.query.branches.findMany({
        columns: { id: true, name: true, tenantId: true },
        orderBy: [asc(branches.name), asc(branches.id)],
        where: eq(branches.tenantId, params.tenantId),
      });
      return rows.map(row => ({ id: row.id, label: row.name, tenantId: row.tenantId }));
    },

    async listRoutingRulesForAdmin(params) {
      // db-access-guard: tenant-scoped -- reason: admin routing rule reads constrain by session-derived tenant and expose aggregate rule metadata only
      const rows = await database.query.crmRoutingRules.findMany({
        orderBy: [
          sql`case when ${crmRoutingRules.archivedAt} is null then 0 else 1 end`,
          asc(crmRoutingRules.branchId),
          asc(crmRoutingRules.priority),
          asc(crmRoutingRules.id),
        ],
        where: eq(crmRoutingRules.tenantId, params.actor.tenantId),
      });
      return rows.map(mapAdminRule);
    },

    async reorderRoutingRules(params) {
      return database.transaction(async tx => {
        const scopedPredicates = [
          eq(crmRoutingRules.tenantId, params.actor.tenantId),
          isNull(crmRoutingRules.archivedAt),
          params.branchId
            ? eq(crmRoutingRules.branchId, params.branchId)
            : isNull(crmRoutingRules.branchId),
        ];
        // db-access-guard: tenant-scoped -- reason: routing reorder source rows constrain by session tenant and requested tenant/branch scope
        const existing = await tx.query.crmRoutingRules.findMany({
          where: and(...scopedPredicates),
        });
        const byId = new Map(existing.map(row => [row.id, row]));
        if (params.ruleIds.length !== existing.length) return [];
        if (params.ruleIds.some(ruleId => !byId.has(ruleId))) return [];
        const rows: CrmRoutingRuleRow[] = [];
        for (const [priority, ruleId] of params.ruleIds.entries()) {
          // db-access-guard: tenant-scoped -- reason: routing reorder update constrains by session tenant and validated rule ID
          const updated = await tx
            .update(crmRoutingRules)
            .set({ priority, updatedAt: new Date() })
            .where(
              and(
                eq(crmRoutingRules.tenantId, params.actor.tenantId),
                eq(crmRoutingRules.id, ruleId),
                isNull(crmRoutingRules.archivedAt),
                params.branchId
                  ? eq(crmRoutingRules.branchId, params.branchId)
                  : isNull(crmRoutingRules.branchId)
              )
            )
            .returning();
          if (!updated[0]) throw new Error('CRM routing reorder failed during priority update');
          rows.push(updated[0]);
        }
        return rows.map(mapAdminRule);
      });
    },

    async setRoutingRuleEnabled(params) {
      // db-access-guard: tenant-scoped -- reason: CRM routing rule enable/disable constrains by session-derived tenant and rule ID
      const rows = await database
        .update(crmRoutingRules)
        .set({ enabled: params.enabled, updatedAt: new Date() })
        .where(and(...adminRulePredicates(params.actor, params.ruleId)))
        .returning();
      return rows[0] ? mapAdminRule(rows[0]) : null;
    },

    async updateRoutingRule(params) {
      const values = ruleWriteValues(params.input);
      // db-access-guard: tenant-scoped -- reason: CRM routing rule update constrains by session-derived tenant, rule ID, and optimistic updatedAt checksum
      const rows = await database
        .update(crmRoutingRules)
        .set(values)
        .where(
          and(
            ...adminRulePredicates(params.actor, params.ruleId),
            isNull(crmRoutingRules.archivedAt),
            eq(crmRoutingRules.updatedAt, new Date(params.expectedUpdatedAt))
          )
        )
        .returning();
      if (rows[0]) return mapAdminRule(rows[0]);
      const existing = await getRoutingRule({ actor: params.actor, ruleId: params.ruleId });
      return existing ? 'cursor_conflict' : null;
    },
  };
}

export const adminCrmRoutingRuleRepository = createAdminCrmRoutingRuleRepository();
