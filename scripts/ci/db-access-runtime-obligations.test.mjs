import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { runtimeProofObligations } from './db-access-runtime-obligations.mjs';
import {
  MESSAGE_PROOF_FILES,
  verifyMessageProofSource,
} from './db-access-message-proof-source.mjs';
const fixture = () => ({
  failures: new Map([['held', { identity: 'held', file: 'source.ts', reason: 'real violation' }]]),
  graph: { failures: [], incomplete: [], incompleteRawCount: 0 },
  directChanges: new Set(['source.ts']),
  firstInvalidatingDependency: new Map(),
  newEntries: [],
  scannedCount: 604,
  baselineCount: 604,
});
test('absent contracts retain original failures and complete graph', () => {
  const f = fixture(),
    before = [...f.failures];
  const r = runtimeProofObligations(f);
  assert.deepEqual([...f.failures], before);
  assert.deepEqual(r.crmObligations.remaining, []);
  assert.equal(r.crmObligations.runtimeAdmission, false);
});
test('unauthenticated runtime join stays red and keeps inventory', () => {
  const f = fixture();
  f.providerUnit = { crmProof: {} };
  const before = [...f.failures];
  const r = runtimeProofObligations(f);
  assert.deepEqual([...f.failures], before);
  assert.equal(r.crmObligations.classificationRejected, true);
  assert.equal(r.crmObligations.operations.length, 0);
  assert.equal(r.crmObligations.runtimeAdmission, false);
  assert.match(r.crmObligations.remaining[0].reason, /unauthenticated/);
  assert.equal(f.graph.incompleteRawCount, 1);
});
test('late CRM rejection rolls back every earlier message discharge atomically', () => {
  const f = fixture(),
    file = MESSAGE_PROOF_FILES[0],
    text = 'export const fixture = 1;';
  const identities = Array.from({ length: 24 }, (_, i) => ({
    identity: 'message-' + i,
    file,
    method: 'query',
    callee: 'db.query',
    reason: 'unknown',
  }));
  const unknownWitnesses = Array.from({ length: 115 }, (_, i) => ({
    file,
    reason: 'unknown-' + i,
    occurrences: 1,
  }));
  const contract = {
    id: 's8-message-integration-proof-v1',
    operations: MESSAGE_PROOF_FILES,
    requiredTests: 9,
    runtimeRequired: true,
    acceptedReceiptInputs: false,
    files: Object.fromEntries(MESSAGE_PROOF_FILES.map(x => [x, { imports: {} }])),
    configuration: {},
    migrations: {},
    identities,
    unknownWitnesses,
  };
  const model = {
    parsed: new Map(
      MESSAGE_PROOF_FILES.map(x => [x, ts.createSourceFile(x, text, ts.ScriptTarget.Latest, true)])
    ),
  };
  f.providerUnit = {
    messageProof: verifyMessageProofSource(
      '/unused',
      model,
      { messageProof: contract },
      () => text
    ),
    crmProof: {},
  };
  for (const row of identities) f.failures.set(row.identity, row);
  f.graph.incomplete = structuredClone(unknownWitnesses);
  f.graph.incompleteRawCount = 115;
  const before = [...f.failures];
  const r = runtimeProofObligations(f);
  assert.deepEqual([...f.failures], before);
  assert.equal(r.messageObligations.operations.length, 0);
  assert.equal(r.messageObligations.unknown.length, 0);
  assert.equal(r.crmObligations.remaining.length, 116);
  assert.equal(f.graph.incompleteRawCount, 116);
  assert.equal(r.crmObligations.runtimeAdmission, false);
});
