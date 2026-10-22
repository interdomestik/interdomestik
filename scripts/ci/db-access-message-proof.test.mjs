import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createSourceModel } from './db-access-source.mjs';
import { candidateSources, digest } from './db-access-trust.mjs';
import { PROVIDER_UNIT_POLICY as policy } from './db-access-provider-unit-policy.mjs';
import {
  MESSAGE_PROOF_FILES,
  verifyMessageProofSource,
  messageProofObligations,
} from './db-access-message-proof-source.mjs';
import {
  MESSAGE_TEST_IDENTITIES,
  validateMessageTestResult,
} from './db-access-message-runtime-result.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const sources = candidateSources(root);
for (const file of Object.keys(policy.messageProof.configuration).filter(f =>
  f.endsWith('/package.json')
))
  sources.set(file, fs.readFileSync(path.join(root, file), 'utf8'));
const model = createSourceModel(sources);
const exact = (directory, file, expected) => {
  const bytes = fs.readFileSync(path.join(directory, file));
  assert.equal(bytes.length, expected.bytes, 'byte drift');
  assert.equal(digest(bytes), expected.sha256, 'hash drift');
  return bytes.toString();
};
const verify = (p = policy, m = model) => verifyMessageProofSource(root, m, p, exact);
const failureMap = () =>
  new Map(policy.messageProof.identities.map(e => [e.identity, structuredClone(e)]));
test('only authenticated exact two-root operations and UNKNOWN witnesses become runtime obligations', () => {
  const contract = verify();
  const failures = failureMap();
  const diagnostics = structuredClone(contract.unknownWitnesses);
  const result = messageProofObligations(contract, failures, diagnostics);
  assert.equal(result.operations.length, 24);
  assert.equal(result.unknown.length, 115);
  assert.equal(result.remaining.length, 0);
  assert.equal(failures.size, 0);
  assert.equal(diagnostics.length, 115, 'original diagnostic inventory preserved');
  assert.equal(
    result.unknown.reduce((n, e) => n + e.occurrences, 0),
    916
  );
  assert.throws(() => contract.operations.push('ordinary.ts'), TypeError);
});
test('new harness and ordinary-business-consumer UNKNOWNs remain incomplete', () => {
  const contract = verify();
  const additions = [
    { file: MESSAGE_PROOF_FILES[0], reason: 'new executable witness', occurrences: 1 },
    {
      file: 'apps/web/src/ordinary-consumer.ts',
      reason: contract.unknownWitnesses[0].reason,
      occurrences: 1,
    },
  ];
  const result = messageProofObligations(contract, failureMap(), [
    ...contract.unknownWitnesses,
    ...additions,
  ]);
  assert.deepEqual(result.remaining, additions);
});
test('ordinary changed scoped controls and business operations remain failures', () => {
  const contract = verify(),
    failures = failureMap();
  const ordinary = {
    identity: 'ordinary',
    file: 'packages/domain-communications/src/messages/send.ts',
    reason: 'existing scoped executable controls changed; root epoch cannot certify equivalence',
  };
  failures.set(ordinary.identity, ordinary);
  messageProofObligations(contract, failures, contract.unknownWitnesses);
  assert.deepEqual([...failures.values()], [ordinary]);
});
test('forged/candidate-supplied receipts and missing/substituted operation witnesses refuse', () => {
  const contract = verify();
  assert.throws(
    () =>
      messageProofObligations(structuredClone(contract), failureMap(), contract.unknownWitnesses),
    /unauthenticated/
  );
  const failures = failureMap();
  failures.delete(contract.identities[0].identity);
  assert.throws(
    () => messageProofObligations(contract, failures, contract.unknownWitnesses),
    /operation witness drift/
  );
  assert.throws(
    () => messageProofObligations(contract, failureMap(), contract.unknownWitnesses.slice(1)),
    /missing UNKNOWN/
  );
});
test('source, business dependency, config and migration journal drift refuse independently', () => {
  for (const [section, file] of [
    ['files', MESSAGE_PROOF_FILES[0]],
    ['files', 'packages/domain-communications/src/messages/send.ts'],
    ['configuration', 'packages/domain-communications/vitest.config.ts'],
    ['migrations', 'packages/database/drizzle/meta/_journal.json'],
  ]) {
    const changed = structuredClone(policy);
    changed.messageProof[section][file].sha256 = '0'.repeat(64);
    assert.throws(() => verify(changed), /hash drift/);
  }
});
test('ordinary sources cannot import either private messages harness', () => {
  for (const target of MESSAGE_PROOF_FILES) {
    const file = 'packages/domain-communications/src/ordinary.ts';
    const input = new Map(sources).set(
      file,
      `import './messages/${path.basename(target, '.ts')}';`
    );
    assert.throws(
      () => verify(policy, createSourceModel(input)),
      /ordinary consumer imports private harness/
    );
  }
});
test('contract expansion and receipt substitution refuse', () => {
  for (const [key, value] of [
    ['requiredTests', 8],
    ['runtimeRequired', false],
    ['acceptedReceiptInputs', true],
    ['operations', [...MESSAGE_PROOF_FILES, 'new.test.ts']],
  ]) {
    const p = structuredClone(policy);
    p.messageProof[key] = value;
    assert.throws(() => verify(p), /contract identity/);
  }
});

function result() {
  return {
    success: true,
    numTotalTests: 9,
    numPassedTests: 9,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: [
      {
        name: root + '/' + MESSAGE_PROOF_FILES[1],
        status: 'passed',
        assertionResults: MESSAGE_TEST_IDENTITIES.map(title => ({
          ancestorTitles: [],
          title,
          status: 'passed',
          failureMessages: [],
        })),
      },
    ],
  };
}
test('nine exact real test identities are required, independently of summary counts', () => {
  assert.deepEqual(validateMessageTestResult(result()), MESSAGE_TEST_IDENTITIES);
  for (const mutate of [
    r => r.testResults[0].assertionResults.pop(),
    r => (r.testResults[0].assertionResults[0].title = 'substituted'),
    r => (r.testResults[0].assertionResults[0] = r.testResults[0].assertionResults[1]),
    r => (r.testResults[0].assertionResults[0].status = 'pending'),
    r => (r.testResults[0].status = 'failed'),
    r => (r.numTodoTests = 1),
  ]) {
    const changed = result();
    mutate(changed);
    assert.throws(() => validateMessageTestResult(changed), /refused/);
  }
});
