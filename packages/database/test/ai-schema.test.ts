import assert from 'node:assert/strict';
import test from 'node:test';

test('schema exports ai run provenance fields', async () => {
  const schema = (await import('../src/schema')) as Record<string, unknown>;

  assert.ok(schema.aiRuns, 'expected aiRuns schema export');

  const aiRuns = schema.aiRuns as Record<string, unknown>;
  assert.ok(aiRuns.model, 'expected aiRuns.model column');
  assert.ok(aiRuns.promptVersion, 'expected aiRuns.promptVersion column');
  assert.ok(aiRuns.tenantId, 'expected aiRuns.tenantId column');
});

test('schema exports extraction linkage fields', async () => {
  const schema = (await import('../src/schema')) as Record<string, unknown>;

  assert.ok(schema.documentExtractions, 'expected documentExtractions schema export');

  const documentExtractions = schema.documentExtractions as Record<string, unknown>;
  assert.ok(documentExtractions.documentId, 'expected documentExtractions.documentId column');
  assert.ok(documentExtractions.entityType, 'expected documentExtractions.entityType column');
  assert.ok(documentExtractions.entityId, 'expected documentExtractions.entityId column');
});

test('documents schema allows policy entities for provenance-linked uploads', async () => {
  const schema = await import('../src/schema');

  assert.ok(
    schema.documentEntityTypeEnum.enumValues.includes('policy'),
    'expected document entity enum to include policy'
  );
});
