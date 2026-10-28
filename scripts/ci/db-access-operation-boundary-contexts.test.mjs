import assert from 'node:assert/strict';
import test from 'node:test';
import { bindEarlyM4Contexts } from './db-access-operation-boundary-contexts.mjs';

const hash = digit => digit.repeat(64);
const trusted = {
  identity: hash('1'),
  contextId: hash('2'),
  sourceSha256: hash('3'),
  imageSha256: hash('4'),
  entryId: 'M4.ops.assign',
  sourceNodeId: 'assignment:write',
  kind: 'trusted',
};
const proof = { ...trusted, contextId: hash('5'), imageSha256: hash('6'), kind: 'proof' };
const derived = (row, construction) => ({
  ...row,
  construction,
  derivationSha256: hash('7'),
});
const inputs = () => ({
  requiredContexts: [{ ...trusted }, { ...proof }],
  constructedContexts: [derived(trusted, 'T2'), derived(proof, 'P2')],
});

test('one identity requires both trusted and proof use bindings; binding is not admission', () => {
  const input = inputs();
  const result = bindEarlyM4Contexts(input);
  assert.equal(result.bindings.length, 1);
  assert.equal(result.bindings[0].contexts.length, 2);
  assert.equal(result.runtimeAdmission, false);
  assert.equal(result.productionConsumerAdmission, false);
  input.constructedContexts[0].sourceSha256 = hash('9');
  assert.equal(result.bindings[0].contexts[0].sourceSha256, trusted.sourceSha256);
  assert.throws(() => result.bindings[0].contexts.push(proof), TypeError);
});

test('a harmless proof copy cannot clear the same identity in a privileged context', () => {
  const input = inputs();
  input.constructedContexts.shift();
  assert.throws(() => bindEarlyM4Contexts(input), /missing or foreign context/u);
});

test('a trusted copy cannot clear its unresolved proof use', () => {
  const input = inputs();
  input.constructedContexts.pop();
  assert.throws(() => bindEarlyM4Contexts(input), /missing or foreign context/u);
});

for (const field of [
  'identity',
  'contextId',
  'sourceSha256',
  'imageSha256',
  'entryId',
  'sourceNodeId',
  'kind',
]) {
  test('rejects changed context ' + field, () => {
    const input = inputs();
    input.constructedContexts[0][field] =
      field === 'kind'
        ? 'proof'
        : field.endsWith('Id') && !['contextId'].includes(field)
          ? 'foreign-entry'
          : hash('8');
    assert.throws(() => bindEarlyM4Contexts(input), /context/u);
  });
}

for (const label of ['requiredContexts', 'constructedContexts']) {
  test('rejects duplicate ' + label + ' rather than deduplicating evidence', () => {
    const input = inputs();
    input[label].push({ ...input[label][0] });
    assert.throws(() => bindEarlyM4Contexts(input), /duplicate context/u);
  });
}

test('fresh correctly bound consumer evidence still grants no early production C', () => {
  const consumer = { ...trusted, kind: 'consumer' };
  assert.throws(
    () =>
      bindEarlyM4Contexts({
        requiredContexts: [consumer],
        constructedContexts: [derived(consumer, 'C')],
      }),
    /unavailable for early M4/u
  );
});

test('proof construction cannot certify an identically bound trusted source copy', () => {
  assert.throws(
    () =>
      bindEarlyM4Contexts({
        requiredContexts: [trusted],
        constructedContexts: [derived(trusted, 'P2')],
      }),
    /unavailable for early M4/u
  );
});

test('unknown image, missing derivation and empty census never become successful bindings', () => {
  for (const mutate of [
    input => {
      input.requiredContexts[0].imageSha256 = null;
    },
    input => {
      delete input.constructedContexts[0].derivationSha256;
    },
    input => {
      input.requiredContexts = [];
      input.constructedContexts = [];
    },
  ]) {
    const input = inputs();
    mutate(input);
    assert.throws(() => bindEarlyM4Contexts(input), /incomplete: operation boundary/u);
  }
});

test('an unresolved-context marker cannot be ignored while checking otherwise valid fields', () => {
  const input = inputs();
  input.requiredContexts[0].unresolved = true;
  assert.throws(() => bindEarlyM4Contexts(input), /fixed data fields/u);
});

test('rejects accessors before reading their identity claims', () => {
  const input = inputs();
  let invoked = false;
  Object.defineProperty(input.constructedContexts[0], 'kind', {
    get() {
      invoked = true;
      return 'trusted';
    },
  });
  assert.throws(() => bindEarlyM4Contexts(input), /fixed data fields/u);
  assert.equal(invoked, false);
});
