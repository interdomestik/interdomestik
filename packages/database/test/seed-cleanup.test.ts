import assert from 'node:assert/strict';
import test from 'node:test';

import * as schema from '../src/schema';
import { cleanupByPrefixes } from '../src/seed-utils/cleanup';

type Operation = {
  kind: 'delete' | 'update';
  table: string;
};

function tableName(table: unknown): string {
  switch (table) {
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

function createFakeDb(operations: Operation[]) {
  return {
    query: {
      claims: {
        findMany: async () => [],
      },
      memberLeads: {
        findMany: async () => [],
      },
      subscriptions: {
        findMany: async () => [],
      },
      crmDeals: {
        findMany: async () => [{ id: 'golden_crm_deal_1' }],
      },
      crmLeads: {
        findMany: async () => [{ id: 'golden_crm_lead_1' }],
      },
      crmRoutingRules: {
        findMany: async () => [{ id: 'golden_crm_routing_rule_1' }],
      },
      crmTasks: {
        findMany: async () => [{ id: 'golden_crm_task_1' }],
      },
      user: {
        findMany: async () => [{ id: 'golden_user_1' }],
      },
    },
    delete(table: unknown) {
      return {
        where: async () => {
          operations.push({ kind: 'delete', table: tableName(table) });
        },
      };
    },
    select() {
      return {
        from() {
          return {
            where: async () => [{ id: 'golden_doc_1' }],
          };
        },
      };
    },
    update(table: unknown) {
      return {
        set: () => ({
          where: async () => {
            operations.push({ kind: 'update', table: tableName(table) });
          },
        }),
      };
    },
  };
}

test('cleanupByPrefixes deletes AI provenance rows before documents uploaded by seeded users', async () => {
  const operations: Operation[] = [];
  const db = createFakeDb(operations);

  await cleanupByPrefixes(db, schema, ['golden_']);

  const deleteOrder = operations.filter(op => op.kind === 'delete').map(op => op.table);
  const documentExtractionsIndex = deleteOrder.indexOf('document_extractions');
  const aiRunsIndex = deleteOrder.indexOf('ai_runs');
  const documentsIndex = deleteOrder.indexOf('documents');

  assert.notEqual(documentExtractionsIndex, -1, 'expected document_extractions cleanup');
  assert.notEqual(aiRunsIndex, -1, 'expected ai_runs cleanup');
  assert.notEqual(documentsIndex, -1, 'expected documents cleanup');
  assert.ok(
    documentExtractionsIndex < aiRunsIndex,
    'expected document_extractions to be deleted before ai_runs'
  );
  assert.ok(aiRunsIndex < documentsIndex, 'expected ai_runs to be deleted before documents');
});

test('cleanupByPrefixes deletes email campaign logs before deleting seeded users', async () => {
  const operations: Operation[] = [];
  const db = createFakeDb(operations);

  await cleanupByPrefixes(db, schema, ['golden_']);

  const deleteOrder = operations.filter(op => op.kind === 'delete').map(op => op.table);
  const emailCampaignLogsIndex = deleteOrder.indexOf('email_campaign_logs');
  const usersIndex = deleteOrder.lastIndexOf('user');

  assert.notEqual(emailCampaignLogsIndex, -1, 'expected email_campaign_logs cleanup');
  assert.notEqual(usersIndex, -1, 'expected user cleanup');
  assert.ok(
    emailCampaignLogsIndex < usersIndex,
    'expected email_campaign_logs to be deleted before users'
  );
});

test('cleanupByPrefixes deletes CRM user dependencies before deleting seeded users', async () => {
  const operations: Operation[] = [];
  const db = createFakeDb(operations);

  await cleanupByPrefixes(db, schema, ['golden_']);

  const deleteOrder = operations.filter(op => op.kind === 'delete').map(op => op.table);
  const crmActivitiesIndex = deleteOrder.indexOf('crm_activities');
  const crmTaskHistoryIndex = deleteOrder.indexOf('crm_task_history');
  const crmTasksIndex = deleteOrder.indexOf('crm_tasks');
  const crmLeadsIndex = deleteOrder.indexOf('crm_leads');
  const usersIndex = deleteOrder.lastIndexOf('user');

  assert.notEqual(crmActivitiesIndex, -1, 'expected crm_activities cleanup');
  assert.notEqual(crmTaskHistoryIndex, -1, 'expected crm_task_history cleanup');
  assert.notEqual(crmTasksIndex, -1, 'expected crm_tasks cleanup');
  assert.notEqual(crmLeadsIndex, -1, 'expected crm_leads cleanup');
  assert.notEqual(usersIndex, -1, 'expected user cleanup');
  assert.ok(crmActivitiesIndex < usersIndex, 'expected crm_activities cleanup before users');
  assert.ok(crmTaskHistoryIndex < crmTasksIndex, 'expected crm_task_history before crm_tasks');
  assert.ok(crmTasksIndex < usersIndex, 'expected crm_tasks cleanup before users');
  assert.ok(crmLeadsIndex < usersIndex, 'expected crm_leads cleanup before users');
});
