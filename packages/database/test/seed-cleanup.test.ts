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

  await cleanupByPrefixes(db as never, schema, ['golden_']);

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
