import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import * as schema from '../src/schema';
import type { cleanupByPrefixes } from '../src/seed-utils/cleanup';

export type Operation = {
  kind: 'delete' | 'update';
  table: string;
  params?: unknown[];
};

type CleanupDb = Parameters<typeof cleanupByPrefixes>[0];

function tableName(table: unknown): string {
  switch (table) {
    case schema.account:
      return 'account';
    case schema.claimMessages:
      return 'claim_messages';
    case schema.claimResponseRequests:
      return 'claim_response_requests';
    case schema.claims:
      return 'claim';
    case schema.notificationDeliveries:
      return 'notification_deliveries';
    case schema.notifications:
      return 'notifications';
    case schema.session:
      return 'session';
    case schema.aiRuns:
      return 'ai_runs';
    case schema.documentAccessLog:
      return 'document_access_log';
    case schema.documentExtractions:
      return 'document_extractions';
    case schema.documents:
      return 'documents';
    case schema.crmActivities:
      return 'crm_activities';
    case schema.crmDealBackfillQuarantine:
      return 'crm_deal_backfill_quarantine';
    case schema.crmDeals:
      return 'crm_deals';
    case schema.crmDealStageHistory:
      return 'crm_deal_stage_history';
    case schema.crmLeads:
      return 'crm_leads';
    case schema.crmLeadOwnershipHistory:
      return 'crm_lead_ownership_history';
    case schema.crmLeadStageHistory:
      return 'crm_lead_stage_history';
    case schema.crmLossReasons:
      return 'crm_loss_reasons';
    case schema.crmPipelineSnapshots:
      return 'crm_pipeline_snapshots';
    case schema.crmPipelineStages:
      return 'crm_pipeline_stages';
    case schema.crmPipelines:
      return 'crm_pipelines';
    case schema.crmRoutingAssignmentsAudit:
      return 'crm_routing_assignments_audit';
    case schema.crmRoutingCursors:
      return 'crm_routing_cursors';
    case schema.crmRoutingRules:
      return 'crm_routing_rules';
    case schema.crmTaskHistory:
      return 'crm_task_history';
    case schema.crmTasks:
      return 'crm_tasks';
    case schema.emailCampaignLogs:
      return 'email_campaign_logs';
    case schema.memberActivities:
      return 'member_activities';
    case schema.user:
      return 'user';
    default:
      return 'other';
  }
}

export function createFakeDb(
  operations: Operation[],
  findUsers: (predicate: SQL) => Promise<{ id: string }[]> = () =>
    Promise.resolve([{ id: 'golden_user_1' }]),
  claimIds: string[][] = []
): CleanupDb {
  const fakeDb = {
    query: {
      claims: {
        findMany: () => Promise.resolve((claimIds.shift() ?? []).map(id => ({ id }))),
      },
      memberLeads: {
        findMany: () => Promise.resolve([]),
      },
      subscriptions: {
        findMany: () => Promise.resolve([]),
      },
      crmDeals: {
        findMany: () => Promise.resolve([{ id: 'golden_crm_deal_1' }]),
      },
      crmLeads: {
        findMany: () => Promise.resolve([{ id: 'golden_crm_lead_1' }]),
      },
      crmRoutingRules: {
        findMany: () => Promise.resolve([{ id: 'golden_crm_routing_rule_1' }]),
      },
      crmTasks: {
        findMany: () => Promise.resolve([{ id: 'golden_crm_task_1' }]),
      },
      user: {
        findMany: ({ where }: { where: SQL }) => findUsers(where),
      },
    },
    delete(table: unknown) {
      return {
        where: (predicate: SQL) => {
          operations.push({
            kind: 'delete',
            table: tableName(table),
            params: new PgDialect().sqlToQuery(predicate).params,
          });
          return Promise.resolve();
        },
      };
    },
    select() {
      return {
        from() {
          return {
            where: (condition: SQL) =>
              Object.assign(Promise.resolve([{ id: 'golden_doc_1' }]), {
                getSQL: () => condition,
              }),
          };
        },
      };
    },
    update(table: unknown) {
      return {
        set: () => ({
          where: () => {
            operations.push({ kind: 'update', table: tableName(table) });
            return Promise.resolve();
          },
        }),
      };
    },
  };

  return fakeDb as unknown as CleanupDb;
}
