import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { cleanupWorkload } from '../src/seed-workload/cleanup';
import { buildWorkloadUsers } from '../src/seed-workload/user-fixtures';

import * as schema from '../src/schema';
import { cleanupByPrefixes } from '../src/seed-utils/cleanup';
import { createFakeDb, type Operation } from './seed-cleanup.test-support';

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

test('workload cleanup deletes owned users, credentials, sessions and dependencies only', async () => {
  const operations: Operation[] = [];
  const fixtures = buildWorkloadUsers();
  const real = { id: 'real-user', tenantId: 'tenant_ks', email: 'real.person@example.com' };
  const db = createFakeDb(operations, predicate => {
    const query = new PgDialect().sqlToQuery(predicate);
    assert.doesNotMatch(query.sql, /\blike\b/i);
    const selected = [...fixtures, real].filter(row => {
      for (let i = 0; i < query.params.length; i += 4) {
        if (
          query.params[i] === row.id &&
          query.params[i + 1] === row.tenantId &&
          query.params[i + 2] === row.email
        )
          return true;
      }
      return false;
    });
    assert.equal(selected.length, 59);
    return Promise.resolve(selected);
  });
  await cleanupWorkload(db, schema);
  for (const table of ['account', 'session', 'email_campaign_logs', 'user']) {
    const deletion = operations.find(op => op.kind === 'delete' && op.table === table);
    assert.ok(deletion, `Expected ${table} cleanup`);
    assert.deepEqual(
      deletion.params,
      fixtures.map(row => row.id)
    );
    assert.ok(!deletion.params?.includes(real.id));
  }
});
