import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import { linkM4FixedOracleCases } from './db-access-m4-fixed-oracles.mjs';
import { mandatoryM4Assertion } from './db-access-m4-assertion-nodes.mjs';
import { verifyM4ProofSource } from './db-access-m4-proof-source.mjs';
import { M4_RUNTIME_CONTRACT } from './db-access-m4-runtime-contract.mjs';
import { PROVIDER_UNIT_POLICY as policy } from './db-access-provider-unit-policy.mjs';
import { bindM4OracleSource } from './db-access-m4-oracle-source-bindings.mjs';

const producer = fileURLToPath(new URL('../..', import.meta.url));
const contracts = [
  'db-access-m4-ops-oracle-contract.json',
  'db-access-m4-existing-oracle-contract.json',
  'db-access-m4-email-oracle-contract.json',
].flatMap(name => JSON.parse(fs.readFileSync(new URL(name, import.meta.url))).cases);
const sourceRecords = policy.m4Proof.sources;
const sources = new Map(),
  parsed = new Map();
for (const file of Object.keys(sourceRecords)) {
  const text = fs.readFileSync(path.join(producer, file), 'utf8');
  sources.set(file, text);
  if (!file.endsWith('.json'))
    parsed.set(file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
}
// Genuine finite source derivation, with explicit unit-only runtime/image doubles.
// No SQL, full native model/inventory, private runtime handle or admission is made.
const source = verifyM4ProofSource(producer, { sources, parsed }, policy);
const runtime = {
  completion: {
    privateCaseIds: [...M4_RUNTIME_CONTRACT.caseIDs.private],
    profileCaseIds: [...M4_RUNTIME_CONTRACT.caseIDs.profiles],
  },
};
// Match actual materialization membership: erased interfaces are not runtime
// inputs. An overinclusive all-source mock previously hid this boundary.
const imageRecords = {
  ...M4_RUNTIME_CONTRACT.files,
  ...M4_RUNTIME_CONTRACT.configuration,
  ...M4_RUNTIME_CONTRACT.migrations,
};
for (const entry of contracts)
  imageRecords[entry.fixtureFile] = policy.producerFiles['scripts/ci/' + entry.fixtureFile];
const input = { source, runtime, imageRecords, producer, policy };

test('fixed oracle join binds exact derived facts and mandatory programs in all six families', () => {
  const links = linkM4FixedOracleCases(input);
  assert.equal(contracts.length, 31);
  assert.equal(links.length, 62);
  assert.equal(links.flatMap(link => link.assertions).length, 335);
  assert.equal(new Set(links.map(link => link.fact.path.split('/')[2])).size, 6);
  assert(links.every(link => link.completeEffectQualified === false));
  for (const entry of contracts) {
    for (const expected of entry.links) {
      const link = links.find(value => value.id === expected.id);
      assert.equal(link.fixtureFile, entry.fixtureFile);
      assert.equal(link.caseId, entry.caseId);
      assert.equal(link.caseGroup, entry.caseGroup);
    }
  }
  assert.equal(
    links.filter(link => link.executionContext === 'database-visibility-fault').length,
    1
  );
  assert.equal(
    new Set(
      links
        .filter(link => link.fact.path.startsWith('/derivations/kernel/'))
        .map(link => link.fact.path)
    ).size,
    9
  );
  assert(links.every(link => link.assertions.every(node => node.mandatoryOnSuccessfulCallback)));
});

test('only the two exact native type-only witnesses avoid an executed-image claim', () => {
  for (const [file, role] of [
    ['apps/web/src/server/operations/m4-private-runtime-types.ts', 'runtimeTypes'],
    ['apps/web/src/server/operations/m4-assignment-controller-types.ts', 'controllerTypes'],
  ]) {
    assert.equal(imageRecords[file], undefined);
    const binding = bindM4OracleSource(source, imageRecords, file);
    assert.equal(binding.binding, 'native-erased-type-witness');
    assert.equal(binding.executedImageBinding, false);
    for (const change of [
      s => delete s.derivations.privateRuntime.facts.types[role],
      s => s.derivations.privateRuntime.facts.types[role].runtimeEffects.push('execution'),
      s => (s.derivations.privateRuntime.sourceSha256[file] = '0'.repeat(64)),
      s => (s.sourceRecords[file].sha256 = '0'.repeat(64)),
    ]) {
      const changed = structuredClone(source);
      change(changed);
      assert.throws(
        () => bindM4OracleSource(changed, imageRecords, file),
        /exact native erased-type derivation/
      );
    }
  }
  const executable = 'apps/web/src/server/operations/m4-private-runtime.ts';
  const missing = { ...imageRecords };
  delete missing[executable];
  assert.throws(() => bindM4OracleSource(source, missing, executable), /fact source differs/);
  const unknown = 'apps/web/src/server/operations/unknown-types.ts';
  const changed = structuredClone(source);
  changed.sourceRecords[unknown] = { sha256: 'a'.repeat(64) };
  assert.throws(() => bindM4OracleSource(changed, imageRecords, unknown), /fact source differs/);
});

test('changed or absent derived facts cannot retain a fixed consequence link', () => {
  for (const change of [
    s => delete s.derivations.kernel.facts.effects[2],
    s => (s.derivations.kernel.facts.effects[2].message = 'different denial'),
  ]) {
    const changed = structuredClone(source);
    change(changed);
    assert.throws(
      () => linkM4FixedOracleCases({ ...input, source: changed }),
      /missing derived source fact|derived fact changed/
    );
  }
});

test('a completed name in the wrong case group or duplicated completion gives no link', () => {
  const id = contracts[0].caseId;
  for (const completion of [
    {
      privateCaseIds: runtime.completion.privateCaseIds.filter(value => value !== id),
      profileCaseIds: [...runtime.completion.profileCaseIds, id],
    },
    {
      ...runtime.completion,
      privateCaseIds: [...runtime.completion.privateCaseIds, id],
    },
  ])
    assert.throws(
      () => linkM4FixedOracleCases({ ...input, runtime: { completion } }),
      /fixed case did not complete in its exact group/
    );
});

test('actual fixture and every selected fact source must match executed image records', () => {
  const first = contracts[0];
  for (const file of [first.fixtureFile, first.links[0].sourceFiles[0]]) {
    const changed = { ...imageRecords, [file]: { sha256: '0'.repeat(64) } };
    assert.throws(
      () => linkM4FixedOracleCases({ ...input, imageRecords: changed }),
      /fixture differs|fact source differs/
    );
  }
});

test('new fixed data itself requires an exact protected producer descriptor', () => {
  const changed = structuredClone(policy);
  changed.producerFiles['scripts/ci/db-access-m4-ops-oracle-contract.json'].sha256 = '0'.repeat(64);
  assert.throws(() => linkM4FixedOracleCases({ ...input, policy: changed }), /input identity/);
});

for (const entry of contracts) {
  const file = 'scripts/ci/' + entry.fixtureFile;
  const fixture = fs.readFileSync(path.join(producer, file), 'utf8');
  test('each assertion remains mandatory and dataflow-bound: ' + entry.caseId, () => {
    assert(fixture.includes(entry.program), 'fixed program is an exact current callback');
    const expressions = new Set(entry.links.flatMap(link => link.assertions));
    for (const expression of expressions) {
      const omittedProgram = entry.program.replace(expression, 'void 0');
      assert.notEqual(omittedProgram, entry.program);
      const omitted = fixture.replace(entry.program, () => omittedProgram);
      assert.throws(
        () => mandatoryM4Assertion(omitted, file, entry.caseId, expression, entry.program),
        /missing or duplicate exact assertion/
      );
    }
    const changedProgram = entry.program.replace('{', '{ void 0;');
    const changed = fixture.replace(entry.program, () => changedProgram);
    assert.throws(
      () => mandatoryM4Assertion(changed, file, entry.caseId, [...expressions][0], entry.program),
      /oracle dataflow changed/
    );
  });
}
