import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { createSourceModel } from './db-access-source.mjs';
import { candidateSources, digest } from './db-access-trust.mjs';
import { PROVIDER_UNIT_POLICY as policy } from './db-access-provider-unit-policy.mjs';
import {
  MESSAGE_FIXTURE,
  MESSAGE_MODULE_URLS,
  MESSAGE_REPLY_RUNTIME,
  MESSAGE_REPLY_WORKER,
  MESSAGE_WEB_CONFIG,
} from './db-access-message-proof-registry.mjs';
import {
  MESSAGE_PROOF_FILES,
  assertPrivateEdges,
  messageProofObligations,
  moduleUrls,
  verifyMessageProofSource,
} from './db-access-message-proof-source.mjs';

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
const ordinaryFile = 'packages/domain-communications/src/messages/access.ts';

test('bound inventory: only exact authenticated private-family witnesses become obligations', () => {
  const contract = verify();
  assert.equal(contract.witnessInventory.state, 'bound');
  const failures = failureMap();
  const diagnostics = structuredClone(contract.unknownWitnesses);
  const result = messageProofObligations(contract, failures, diagnostics);
  assert.equal(result.operations.length, contract.witnessInventory.operations);
  assert.equal(result.unknown.length, contract.witnessInventory.diagnostics);
  assert.equal(result.remaining.length, 0);
  assert.equal(failures.size, 0);
  assert.equal(
    diagnostics.length,
    contract.unknownWitnesses.length,
    'original inventory preserved'
  );
  assert.deepEqual(
    result.unknown.map(e => e.occurrences),
    contract.unknownWitnesses.map(e => e.occurrences),
    'multiplicity preserved'
  );
  assert.throws(() => contract.operations.push('ordinary.ts'), TypeError);
});

test('HOLD inventory authenticates sources but discharges nothing', () => {
  const p = structuredClone(policy);
  Object.assign(p.messageProof, {
    witnessInventory: { state: 'hold', operations: 0, diagnostics: 0 },
    identities: [],
    unknownWitnesses: [],
  });
  const contract = verify(p);
  const failures = failureMap();
  failures.set('ordinary', { identity: 'ordinary', file: ordinaryFile, reason: 'unknown' });
  const incomplete = [
    ...structuredClone(policy.messageProof.unknownWitnesses),
    { file: ordinaryFile, reason: 'unknown', occurrences: 1 },
  ];
  const result = messageProofObligations(contract, failures, incomplete);
  assert.equal(failures.size, policy.messageProof.identities.length + 1);
  assert.deepEqual(result.remaining, incomplete);
  assert.equal(result.operations.length + result.unknown.length, 0);
  assert.equal(result.held.operations.length, policy.messageProof.identities.length);
  assert.equal(result.held.unknown.length, policy.messageProof.unknownWitnesses.length);
  assert.ok(
    [...result.held.operations, ...result.held.unknown].every(row => row.file !== ordinaryFile)
  );
});

test('unbound, inconsistent or ordinary-file witness inventories refuse', () => {
  const mutations = [
    m => delete m.witnessInventory,
    m => (m.witnessInventory.state = 'reviewed'),
    m => (m.witnessInventory.operations += 1),
    m => (m.witnessInventory.diagnostics += 1),
    m => {
      m.identities.push({
        identity: 'ordinary-operation',
        file: ordinaryFile,
        method: 'method',
        callee: 'callee',
        reason: 'reason',
      });
      m.witnessInventory.operations += 1;
    },
    m => {
      m.unknownWitnesses.push({ file: ordinaryFile, reason: 'reason', occurrences: 1 });
      m.witnessInventory.diagnostics += 1;
    },
    m =>
      Object.assign(m, {
        witnessInventory: { state: 'hold', operations: 0, diagnostics: 0 },
        identities: [{ identity: 'held', file: MESSAGE_FIXTURE }],
      }),
  ];
  if (policy.messageProof.identities.length)
    mutations.push(m => {
      m.identities.push(structuredClone(m.identities[0]));
      m.witnessInventory.operations += 1;
    });
  for (const mutate of mutations) {
    const p = structuredClone(policy);
    mutate(p.messageProof);
    assert.throws(() => verify(p), /HOLD|finite/);
  }
});

test('new private-harness and ordinary-consumer UNKNOWNs remain incomplete', () => {
  const contract = verify();
  const additions = [
    { file: MESSAGE_FIXTURE, reason: 'new executable witness', occurrences: 1 },
    {
      file: 'apps/web/src/ordinary-consumer.ts',
      reason: contract.unknownWitnesses[0]?.reason ?? 'new executable witness',
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

test('forged/candidate-supplied receipts and missing/substituted witnesses refuse', () => {
  const contract = verify();
  assert.throws(
    () =>
      messageProofObligations(structuredClone(contract), failureMap(), contract.unknownWitnesses),
    /unauthenticated/
  );
  if (contract.identities.length) {
    const missing = failureMap();
    missing.delete(contract.identities[0].identity);
    assert.throws(
      () => messageProofObligations(contract, missing, contract.unknownWitnesses),
      /operation witness drift/
    );
    const substituted = failureMap();
    substituted.get(contract.identities[0].identity).reason = 'substituted';
    assert.throws(
      () => messageProofObligations(contract, substituted, contract.unknownWitnesses),
      /operation witness drift/
    );
  }
  if (contract.unknownWitnesses.length)
    assert.throws(
      () => messageProofObligations(contract, failureMap(), contract.unknownWitnesses.slice(1)),
      /missing UNKNOWN/
    );
});

test('private source, run configuration and migration drift refuse independently', () => {
  for (const [section, file] of [
    ['files', MESSAGE_FIXTURE],
    ['files', MESSAGE_REPLY_RUNTIME],
    ['files', MESSAGE_REPLY_WORKER],
    ['files', MESSAGE_PROOF_FILES[1]],
    ['files', 'packages/domain-communications/src/messages/send.ts'],
    ['configuration', 'packages/domain-communications/vitest.config.ts'],
    ['configuration', MESSAGE_WEB_CONFIG],
    ['migrations', 'packages/database/drizzle/meta/_journal.json'],
  ]) {
    const hashChanged = structuredClone(policy);
    hashChanged.messageProof[section][file].sha256 = '0'.repeat(64);
    assert.throws(() => verify(hashChanged), /hash drift|pin/);
    const bytesChanged = structuredClone(policy);
    bytesChanged.messageProof[section][file].bytes += 1;
    assert.throws(() => verify(bytesChanged), /byte drift/);
  }
});

const ordinaryConsumer = 'packages/domain-communications/src/ordinary.ts';
const relative = target => {
  const value = path.posix.relative(path.posix.dirname(ordinaryConsumer), target);
  return value.startsWith('.') ? value : './' + value;
};
test('ordinary sources cannot import or URL-reference any private harness file', () => {
  for (const target of MESSAGE_PROOF_FILES)
    for (const [text, reason] of [
      [
        `import '${relative(target).replace(/\.ts$/u, '')}';`,
        /ordinary consumer imports private harness/,
      ],
      [
        `export const u = new URL('${relative(target)}', import.meta.url);`,
        /ordinary consumer references private harness/,
      ],
    ])
      assert.throws(
        () => verify(policy, createSourceModel(new Map(sources).set(ordinaryConsumer, text))),
        reason
      );
});

test('private-to-private edges and executed module URLs are exact', () => {
  const [, tenant, , , safety] = MESSAGE_PROOF_FILES;
  assert.doesNotThrow(() =>
    assertPrivateEdges(MESSAGE_FIXTURE, { './runtime': MESSAGE_REPLY_RUNTIME, postgres: null })
  );
  for (const [file, edges] of [
    [safety, { './fixture': MESSAGE_FIXTURE, './runtime': MESSAGE_REPLY_RUNTIME }],
    [tenant, {}],
    [MESSAGE_REPLY_WORKER, { './fixture': MESSAGE_FIXTURE }],
    [MESSAGE_FIXTURE, { './runtime': MESSAGE_REPLY_RUNTIME, './worker': MESSAGE_REPLY_WORKER }],
  ])
    assert.throws(() => assertPrivateEdges(file, edges), /private harness edge mismatch/);
  const parse = text => ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true);
  assert.throws(
    () => moduleUrls(parse('new URL(name, import.meta.url);'), 'x.ts'),
    /non-literal module URL/
  );
  assert.throws(() => moduleUrls(parse(`import.meta.resolve('tsx');`), 'x.ts'), /module resolver/);
  assert.deepEqual(moduleUrls(parse(sources.get(MESSAGE_REPLY_RUNTIME)), MESSAGE_REPLY_RUNTIME), [
    ...MESSAGE_MODULE_URLS[MESSAGE_REPLY_RUNTIME],
  ]);
  assert.doesNotMatch(sources.get(MESSAGE_REPLY_RUNTIME), /createRequire|require\.resolve/u);
});

test('contract expansion, case substitution and configuration promotion refuse', () => {
  for (const mutate of [
    c => (c.id = 's8-message-integration-proof-v1'),
    c => (c.version = 1),
    c => (c.requiredTests = 19),
    c => (c.runtimeRequired = false),
    c => (c.acceptedReceiptInputs = true),
    c => c.operations.push('new.test.ts'),
    c => c.operations.pop(),
    c => (c.cases[0].fullName = 'substituted'),
    c => c.cases.pop(),
    c => (c.cases[3].kind = 'source-target-safety'),
    c => (c.files[MESSAGE_WEB_CONFIG] = c.configuration[MESSAGE_WEB_CONFIG]),
  ]) {
    const p = structuredClone(policy);
    mutate(p.messageProof);
    assert.throws(() => verify(p), /contract identity|configuration admitted/);
  }
  const widened = structuredClone(policy);
  for (let index = 0; Object.keys(widened.messageProof.files).length <= 128; index++)
    widened.messageProof.files[`packages/widened/${index}.ts`] = {
      mode: '100644',
      bytes: 0,
      sha256: '0'.repeat(64),
      imports: {},
    };
  assert.throws(() => verify(widened), /finite closure/);
});
