import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createSourceModel } from './db-access-source.mjs';
import { candidateSources, digest } from './db-access-trust.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
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
    file = MESSAGE_PROOF_FILES[0];
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
  // Synthetic matching rows exercise atomic rollback, never SQL or graph admission.
  const contract = {
    ...structuredClone(PROVIDER_UNIT_POLICY.messageProof),
    witnessInventory: {
      state: 'bound',
      operations: identities.length,
      diagnostics: unknownWitnesses.length,
    },
    identities,
    unknownWitnesses,
  };
  const root = path.resolve(import.meta.dirname, '../..');
  const sources = candidateSources(root);
  for (const name of Object.keys(contract.configuration).filter(name =>
    name.endsWith('/package.json')
  ))
    sources.set(name, fs.readFileSync(path.join(root, name), 'utf8'));
  const model = createSourceModel(sources);
  f.providerUnit = {
    messageProof: verifyMessageProofSource(
      root,
      model,
      { messageProof: contract },
      (directory, name, expected) => {
        const bytes = fs.readFileSync(path.join(directory, name));
        assert.equal(bytes.length, expected.bytes);
        assert.equal(digest(bytes), expected.sha256);
        return bytes.toString();
      }
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
