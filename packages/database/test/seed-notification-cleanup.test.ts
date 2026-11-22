import assert from 'node:assert/strict';
import test from 'node:test';
import * as schema from '../src/schema';
import { cleanupClaimNotificationRows } from '../src/seed-utils/claim-notification-cleanup';
import { cleanupByPrefixes } from '../src/seed-utils/cleanup';
import { createFakeDb, type Operation } from './seed-cleanup.test-support';

test('prefix cleanup deletes delivery and response rows before claims, messages and users', async () => {
  const operations: Operation[] = [];
  const db = createFakeDb(operations, undefined, [['golden_claim'], ['user_claim']]);

  await cleanupByPrefixes(db, schema, ['golden_']);

  for (const claimId of ['golden_claim', 'user_claim']) {
    const messageDelete = operations.findIndex(
      op => op.table === 'claim_messages' && op.params?.includes(claimId)
    );
    const claimDelete = operations.findIndex(
      (op, index) => op.table === 'claim' && op.params?.includes(claimId) && index > messageDelete
    );
    assert.ok(messageDelete >= 0 && claimDelete > messageDelete);
    for (const table of ['notification_deliveries', 'claim_response_requests', 'notifications']) {
      const childDelete = operations.findIndex(
        op => op.table === table && op.params?.includes(claimId)
      );
      assert.ok(childDelete >= 0 && childDelete < messageDelete);
    }
  }
  const userDelete = operations.findIndex(op => op.table === 'user');
  for (const table of ['notification_deliveries', 'claim_response_requests']) {
    const childDelete = operations.findIndex(
      op => op.table === table && op.params?.includes('golden_user_1')
    );
    assert.ok(childDelete >= 0 && childDelete < userDelete);
  }
});

test('message cleanup scopes delivery and both response message references to the fixture tenant', async () => {
  const operations: Operation[] = [];
  await cleanupClaimNotificationRows(createFakeDb(operations), {
    tenantId: 'fixture-tenant',
    messageIds: ['fixture-message'],
  });
  assert.deepEqual(operations, [
    {
      kind: 'delete',
      table: 'notification_deliveries',
      params: ['fixture-tenant', 'fixture-message'],
    },
    {
      kind: 'delete',
      table: 'claim_response_requests',
      params: ['fixture-tenant', 'fixture-message', 'fixture-message'],
    },
    { kind: 'delete', table: 'notifications', params: ['fixture-tenant', 'fixture-message'] },
  ]);
});
