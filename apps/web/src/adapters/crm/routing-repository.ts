import type { CrmRoutingRepository } from '@interdomestik/domain-crm/routing';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { branches, crmRoutingRules, user } from '@interdomestik/database/schema';

import type {
  AdminCrmRoutingRuleAdminRepository,
  AdminCrmRoutingRuleRow,
} from './routing-admin-types';
import { mapAdminRule, ruleWriteValues, type CrmRoutingRuleRow } from './routing-row-mapping';
import {
  advanceRoutingCursorInDatabase,
  appendRoutingAuditInDatabase,
  findRoutingAuditByIdempotencyInDatabase,
  listRoutingRulesInDatabase,
} from './routing-operations';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export type {
  AdminCrmRoutingAgentScopeRow,
  AdminCrmRoutingBranchRow,
  AdminCrmRoutingRuleAdminRepository,
  AdminCrmRoutingRuleRow,
  AdminCrmRoutingRuleWriteInput,
} from './routing-admin-types';

function adminRulePredicates(actor: CrmActorContext, ruleId?: string) {
  const predicates = [eq(crmRoutingRules.tenantId, actor.tenantId)];
  if (ruleId) predicates.push(eq(crmRoutingRules.id, ruleId));
  return predicates;
}

export function createCrmRoutingRepository(authority: TenantAuthority): CrmRoutingRepository {
  return {
    findRoutingAssignmentAuditByIdempotency: params =>
      withTenantAuthority(authority, scoped =>
        findRoutingAuditByIdempotencyInDatabase(scoped, params)
      ),
    listRoutingRules: params =>
      withTenantAuthority(authority, scoped => listRoutingRulesInDatabase(scoped, params)),
    advanceRoutingCursor: params =>
      withTenantAuthority(authority, scoped => advanceRoutingCursorInDatabase(scoped, params)),
    appendRoutingAssignmentAudit: params =>
      withTenantAuthority(authority, scoped => appendRoutingAuditInDatabase(scoped, params)),
  };
}

export function createAdminCrmRoutingRuleRepository(
  authority: TenantAuthority
): AdminCrmRoutingRuleAdminRepository {
  async function getRoutingRule(params: {
    actor: CrmActorContext;
    ruleId: string;
  }): Promise<AdminCrmRoutingRuleRow | null> {
    // db-access-guard: tenant-scoped -- reason: CRM routing rule lookup constrains by session-derived tenant and rule ID
    const row = await withTenantAuthority(
      authority,
      async scoped =>
        await scoped.query.crmRoutingRules.findFirst({
          where: and(...adminRulePredicates(params.actor, params.ruleId)),
        })
    );
    return row ? mapAdminRule(row) : null;
  }

  return {
    async archiveRoutingRule(params) {
      // db-access-guard: tenant-scoped -- reason: CRM routing rule archive constrains by session-derived tenant and rule ID
      const rows = await withTenantAuthority(
        authority,
        async scoped =>
          await scoped
            .update(crmRoutingRules)
            .set({ archivedAt: new Date(), updatedAt: new Date() })
            .where(and(...adminRulePredicates(params.actor, params.ruleId)))
            .returning()
      );
      return rows[0] ? mapAdminRule(rows[0]) : null;
    },

    async createRoutingRule(params) {
      const values = ruleWriteValues(params.input);
      // db-access-guard: tenant-scoped -- reason: CRM routing rule create derives tenant from authorized admin actor
      const rows = await withTenantAuthority(
        authority,
        async scoped =>
          await scoped
            .insert(crmRoutingRules)
            .values({
              ...values,
              id: randomUUID(),
              tenantId: params.actor.tenantId,
            })
            .returning()
      );
      if (!rows[0]) throw new Error('CRM routing rule create returned no row');
      return mapAdminRule(rows[0]);
    },

    getRoutingRule,

    async listAgentScopes(params) {
      if (params.agentIds.length === 0) return [];
      // db-access-guard: tenant-scoped -- reason: routing admin validation constrains agent lookup by session tenant and submitted agent IDs
      const rows = await withTenantAuthority(
        authority,
        async scoped =>
          await scoped.query.user.findMany({
            columns: { branchId: true, id: true, role: true, tenantId: true },
            where: and(eq(user.tenantId, params.tenantId), inArray(user.id, [...params.agentIds])),
          })
      );
      return rows.map(row => ({
        branchId: row.branchId ?? null,
        id: row.id,
        role: row.role,
        tenantId: row.tenantId,
      }));
    },

    async listBranches(params) {
      // db-access-guard: tenant-scoped -- reason: routing admin branch labels constrain by session tenant only
      const rows = await withTenantAuthority(
        authority,
        async scoped =>
          await scoped.query.branches.findMany({
            columns: { id: true, name: true, tenantId: true },
            orderBy: [asc(branches.name), asc(branches.id)],
            where: eq(branches.tenantId, params.tenantId),
          })
      );
      return rows.map(row => ({ id: row.id, label: row.name, tenantId: row.tenantId }));
    },

    async listRoutingRulesForAdmin(params) {
      // db-access-guard: tenant-scoped -- reason: admin routing rule reads constrain by session-derived tenant and expose aggregate rule metadata only
      const rows = await withTenantAuthority(
        authority,
        async scoped =>
          await scoped.query.crmRoutingRules.findMany({
            orderBy: [
              sql`case when ${crmRoutingRules.archivedAt} is null then 0 else 1 end`,
              asc(crmRoutingRules.branchId),
              asc(crmRoutingRules.priority),
              asc(crmRoutingRules.id),
            ],
            where: eq(crmRoutingRules.tenantId, params.actor.tenantId),
          })
      );
      return rows.map(mapAdminRule);
    },

    async reorderRoutingRules(params) {
      return withTenantAuthority(
        authority,
        async scoped =>
          await scoped.transaction(async tx => {
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
          })
      );
    },

    async setRoutingRuleEnabled(params) {
      // db-access-guard: tenant-scoped -- reason: CRM routing rule enable/disable constrains by session-derived tenant and rule ID
      const rows = await withTenantAuthority(
        authority,
        async scoped =>
          await scoped
            .update(crmRoutingRules)
            .set({ enabled: params.enabled, updatedAt: new Date() })
            .where(and(...adminRulePredicates(params.actor, params.ruleId)))
            .returning()
      );
      return rows[0] ? mapAdminRule(rows[0]) : null;
    },

    async updateRoutingRule(params) {
      const values = ruleWriteValues(params.input);
      // db-access-guard: tenant-scoped -- reason: CRM routing rule update constrains by session-derived tenant, rule ID, and optimistic updatedAt checksum
      const rows = await withTenantAuthority(
        authority,
        async scoped =>
          await scoped
            .update(crmRoutingRules)
            .set(values)
            .where(
              and(
                ...adminRulePredicates(params.actor, params.ruleId),
                isNull(crmRoutingRules.archivedAt),
                eq(crmRoutingRules.updatedAt, new Date(params.expectedUpdatedAt))
              )
            )
            .returning()
      );
      if (rows[0]) return mapAdminRule(rows[0]);
      const existing = await getRoutingRule({ actor: params.actor, ruleId: params.ruleId });
      return existing ? 'cursor_conflict' : null;
    },
  };
}
