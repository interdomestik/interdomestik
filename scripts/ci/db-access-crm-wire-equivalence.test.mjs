import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { crmDigest, validateCrmContract } from './db-access-crm-proof-shape.mjs';
import { classifyCrmWitnesses } from './db-access-crm-proof-witnesses.mjs';
import { validateCrmJoinBindings, joinFreshCrmProof } from './db-access-crm-proof-join.mjs';
import { logicalFixture, materializeContract } from './db-access-crm-wire-contract-fixture.mjs';
import { serializedJoinFixture } from './db-access-crm-wire-join-fixture.mjs';

test('paired valid decoded contracts preserve shape, witnessed residual and join-binding semantics', t => {
  const logical = logicalFixture();
  const legacy = materializeContract(t, logical.contract, false);
  const encoded = materializeContract(t, logical.contract, true);
  const left = legacy.run(),
    right = encoded.run();
  assert.deepEqual(right, left);
  assert.deepEqual([...validateCrmContract(right)], [...validateCrmContract(left)]);
  const oldObserved = logical.observed(),
    newObserved = logical.observed();
  const oldWitness = classifyCrmWitnesses(left, oldObserved);
  const newWitness = classifyCrmWitnesses(right, newObserved);
  assert.deepEqual(newWitness, oldWitness);
  assert.equal(newObserved.failures.size, 0);
  assert.equal(newWitness.runtimeAdmission, false);
  assert.equal(crmDigest(right), crmDigest(left));
  const oldJoin = serializedJoinFixture(left, legacy.policy.producerFiles);
  const newJoin = serializedJoinFixture(right, encoded.policy.producerFiles);
  assert.notEqual(newJoin.provider.policySha256, oldJoin.provider.policySha256);
  assert.equal(validateCrmJoinBindings(oldJoin).runtimeAdmission, false);
  assert.equal(validateCrmJoinBindings(newJoin).runtimeAdmission, false);
  assert.throws(() => joinFreshCrmProof(oldJoin), /direct runtime execution/u);
  assert.throws(() => joinFreshCrmProof(newJoin), /direct runtime execution/u);
  assert.throws(
    () => validateCrmJoinBindings({ ...newJoin, runtime: oldJoin.runtime }),
    /crm proof/u
  );
  assert.throws(
    () => validateCrmJoinBindings({ ...newJoin, provider: oldJoin.provider }),
    /crm proof/u
  );
});
test('unmatched observations remain unresolved after wire decoding', t => {
  const f = logicalFixture(),
    decoded = materializeContract(t, f.contract, true).run();
  const observed = f.observed();
  observed.failures.set('unknown', { identity: 'unknown' });
  observed.incomplete.push({ file: 'foreign.ts', reason: 'unreviewed', occurrences: 1 });
  const result = classifyCrmWitnesses(decoded, observed);
  assert.equal(observed.failures.has('unknown'), true);
  assert.deepEqual(result.remaining, [
    { file: 'foreign.ts', reason: 'unreviewed', occurrences: 1 },
  ]);
  assert.equal(result.runtimeAdmission, false);
});
for (const [name, mutate] of [
  [
    'missing case mapping',
    c => {
      c.witnesses.diagnostics[0].caseIds = ['crm-missing'];
    },
  ],
  [
    'unbound source',
    c => {
      c.witnesses.diagnostics[0].file = 'foreign.ts';
    },
  ],
  [
    'production mapped to source-only case',
    c => {
      c.cases[0].kind = 'source-classification';
    },
  ],
  [
    'duplicate diagnostic identity',
    c => {
      c.witnesses.diagnostics.push(structuredClone(c.witnesses.diagnostics[0]));
    },
  ],
  [
    'unused case',
    c => {
      c.cases.push({ ...c.cases[0], id: 'crm-unused' });
    },
  ],
  [
    'runtime case mismatch',
    c => {
      c.runtime.requiredCases = ['crm-other'];
    },
  ],
])
  test('decoded authentic data does not bypass shape rejection: ' + name, t => {
    const f = logicalFixture();
    mutate(f.contract);
    const decoded = materializeContract(t, f.contract, true).run();
    assert.throws(() => validateCrmContract(decoded), /crm proof/u);
  });
for (const [name, mutate] of [
  [
    'changed inventory',
    o => {
      o.newEntries[0].callee = 'db.select';
    },
  ],
  [
    'changed mount',
    o => {
      o.mountEvidence.analysisIncomplete = false;
    },
  ],
  [
    'changed operation',
    o => {
      o.failures.get('operation').callee = 'db.select';
    },
  ],
  [
    'changed occurrences',
    o => {
      o.incomplete[0].occurrences = 2;
    },
  ],
])
  test('decoded contract retains witness rejection: ' + name, t => {
    const f = logicalFixture(),
      decoded = materializeContract(t, f.contract, true).run();
    const observed = f.observed();
    mutate(observed);
    assert.throws(() => classifyCrmWitnesses(decoded, observed), /crm proof/u);
    assert.equal(observed.failures.has('operation'), true);
  });
test('128 data shards remain accepted; 129 remain rejected', t => {
  const f = logicalFixture();
  const atLimit = materializeContract(t, f.contract, true, { shards: 128 });
  assert.deepEqual(atLimit.run(), f.contract);
  assert.throws(materializeContract(t, f.contract, true, { shards: 129 }).run, /shard inventory/u);
});
test('authenticated index enforces exact 128KiB boundary', t => {
  const f = logicalFixture();
  const atLimit = materializeContract(t, f.contract, true, { indexBytes: 131072 });
  assert.equal(
    atLimit.policy.producerFiles['scripts/ci/db-access-crm-proof-policy.json'].bytes,
    131072
  );
  assert.equal(atLimit.run().id, f.contract.id);
  assert.throws(
    materializeContract(t, f.contract, true, { indexBytes: 131073 }).run,
    /file byte budget/u
  );
});
test('encoded file mode mismatch refuses exact authentication', t => {
  const f = logicalFixture(),
    wire = materializeContract(t, f.contract, true);
  fs.chmodSync(path.join(wire.root, wire.index.shards[0]), 0o755);
  assert.throws(wire.run, /input identity/u);
});
