import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(
  new URL('./db-access-m4-runtime-fixture.mjs', import.meta.url),
  'utf8'
);
const contract = JSON.parse(
  fs.readFileSync(new URL('./db-access-m4-runtime-contract.json', import.meta.url), 'utf8')
);

// Execute only these actual pure gates, never import the SQL/fork fixture wrapper.
function gates(text) {
  const assertions = [
    ...text.matchAll(/^    assert\.equal\(result\.(privateCases|profileCases)\.length, \d+\);$/gm),
  ];
  assert.equal(assertions.length, 2, 'Exactly both fixture cardinality assertions are selected');
  const completion = [...text.matchAll(/^  result\.complete =\n([\s\S]*?);\n  return result;$/gm)];
  assert.equal(
    completion.length,
    1,
    'Exactly the actual wrapper completion expression is selected'
  );
  return {
    assertions: new vm.Script(assertions.map(row => row[0]).join('\n')),
    completion: new vm.Script('result.complete =\n' + completion[0][1] + ';'),
  };
}

function result(
  privateCount = contract.caseIDs.private.length,
  profileCount = contract.caseIDs.profiles.length
) {
  return {
    privateCases: Array.from({ length: privateCount }, () => ({ passed: true })),
    profileCases: Array.from({ length: profileCount }, () => ({ passed: true })),
    setupComplete: true,
    cleanupComplete: true,
    remainingOwnedSessions: 0,
  };
}

test('actual wrapper gates accept the exact contract16 private23 profile case cardinalities', () => {
  assert.equal(
    contract.fixtureFiles.filter(file => file === 'db-access-m4-runtime-fixture.mjs').length,
    1
  );
  assert.equal(contract.caseIDs.private.length, 16);
  assert.equal(contract.caseIDs.profiles.length, 23);
  assert.equal(new Set(contract.caseIDs.private).size, 16);
  assert.equal(new Set(contract.caseIDs.profiles).size, 23);
  const actual = gates(source),
    context = { assert, result: result() };
  actual.assertions.runInNewContext(context);
  actual.completion.runInNewContext(context);
  assert.equal(context.result.complete, true);
});

test('actual wrapper rejects missing or extra cases in either family at both gates', () => {
  const actual = gates(source);
  for (const [privateCount, profileCount] of [
    [15, 23],
    [17, 23],
    [16, 22],
    [16, 24],
  ]) {
    const context = { assert, result: result(privateCount, profileCount) };
    assert.throws(() => actual.assertions.runInNewContext(context), { code: 'ERR_ASSERTION' });
    actual.completion.runInNewContext(context);
    assert.equal(context.result.complete, false);
  }
});

test('stale v1 counts fail and independently reverting either fixed literal is detected', () => {
  const staleAssertion = source.replace(
    'assert.equal(result.privateCases.length, 16);',
    'assert.equal(result.privateCases.length, 15);'
  );
  const staleCompletion = source.replace(
    'result.privateCases.length === 16',
    'result.privateCases.length === 15'
  );
  assert.notEqual(staleAssertion, source);
  assert.notEqual(staleCompletion, source);
  for (const changed of [
    staleAssertion,
    staleCompletion,
    staleAssertion.replace(
      'result.privateCases.length === 16',
      'result.privateCases.length === 15'
    ),
  ]) {
    const actual = gates(changed),
      context = { assert, result: result() };
    let assertionsAccepted = true;
    try {
      actual.assertions.runInNewContext(context);
    } catch (error) {
      assert.equal(error.code, 'ERR_ASSERTION');
      assertionsAccepted = false;
    }
    actual.completion.runInNewContext(context);
    assert.equal(assertionsAccepted && context.result.complete, false);
  }
});

test('actual completion still refuses failure incomplete setup cleanup and remaining sessions', () => {
  const actual = gates(source);
  for (const refused of [
    { failure: { stage: 'fixture' } },
    { setupComplete: false },
    { cleanupComplete: false },
    { remainingOwnedSessions: 1 },
  ]) {
    const context = { assert, result: { ...result(), ...refused } };
    actual.completion.runInNewContext(context);
    assert.equal(context.result.complete, false);
  }
});

test('the previous twenty-profile contract cannot satisfy either current gate', () => {
  const actual = gates(source),
    context = { assert, result: result(16, 20) };
  assert.throws(() => actual.assertions.runInNewContext(context), { code: 'ERR_ASSERTION' });
  actual.completion.runInNewContext(context);
  assert.equal(context.result.complete, false);
  for (const variant of [
    source.replace(
      'assert.equal(result.profileCases.length, 23);',
      'assert.equal(result.profileCases.length, 20);'
    ),
    source.replace('result.profileCases.length === 23', 'result.profileCases.length === 20'),
  ]) {
    assert.notEqual(variant, source);
    const changed = gates(variant),
      value = { assert, result: result() };
    let accepted = true;
    try {
      changed.assertions.runInNewContext(value);
    } catch {
      accepted = false;
    }
    changed.completion.runInNewContext(value);
    assert.equal(accepted && value.result.complete, false);
  }
});
