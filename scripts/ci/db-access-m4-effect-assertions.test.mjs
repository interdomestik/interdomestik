import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  mandatoryM4Assertion,
  assertM4AwaitedCaseRunner,
} from './db-access-m4-assertion-nodes.mjs';
import {
  M4_KERNEL_ASSERTION_CASE as caseId,
  M4_KERNEL_ASSERTION_FILE as fixture,
  M4_KERNEL_ASSERTION_PROGRAM as program,
  M4_KERNEL_ASSERTION_LINKS as links,
} from './db-access-m4-kernel-assertion-contract.mjs';
import { linkM4EffectAssertions } from './db-access-m4-effect-assertions.mjs';
import { assertM4RuntimeImageRecords } from './db-access-m4-runtime.mjs';

const source = fs.readFileSync(new URL('./' + fixture, import.meta.url), 'utf8');
const parent = fs.readFileSync(
  new URL('./db-access-m4-runtime-fixture.mjs', import.meta.url),
  'utf8'
);
const expression = 'assert.equal(after.audit.length, 1)';
const locate = text => mandatoryM4Assertion(text, fixture, caseId, expression);
const unit = body => `import assert from 'node:assert/strict';
export async function fixture({ run }) {
  await run(${JSON.stringify(caseId)}, async () => { ${body} });
}`;

test('all six fixed assertions locate actual mandatory nodes in the existing SQL fixture', () => {
  const nodes = links.flatMap(link =>
    link.assertions.map(text => mandatoryM4Assertion(source, fixture, caseId, text, program))
  );
  assert.equal(nodes.length, 6);
  assert.equal(new Set(nodes.map(node => node.start)).size, 6);
  assert(nodes.every(node => node.mandatoryOnSuccessfulCallback && node.file === fixture));
  assertM4AwaitedCaseRunner(parent);
});

test('freshly hashed valid JavaScript missing a required assertion is refused by correspondence', () => {
  const variant = source.replace(expression + ';', '');
  assert.notEqual(
    createHash('sha256').update(variant).digest('hex'),
    createHash('sha256').update(source).digest('hex')
  );
  assert.throws(() => locate(variant), /missing or duplicate exact assertion/);
  // This is a source/control regression, not the still-required actual paired semantic negative.
});

test('unchanged case name cannot replace an executed assertion with a conditional or loop', () => {
  for (const body of [`if (false) { ${expression}; }`, `for (const x of []) { ${expression}; }`])
    assert.throws(() => locate(unit(body)), /conditional or nested/);
});

test('early successful return and catch suppression cannot imply assertion execution', () => {
  for (const body of [`if (true) return; ${expression};`, `try { ${expression}; } catch {}`])
    assert.throws(() => locate(unit(body)), /return or catch/);
});

test('try/finally keeps its mandatory assertion while a nested callback receives no credit', () => {
  assert.equal(
    locate(unit(`try { ${expression}; } finally { await cleanup(); }`))
      .mandatoryOnSuccessfulCallback,
    true
  );
  assert.throws(
    () => locate(unit(`const unused = () => { ${expression}; };`)),
    /missing or duplicate exact assertion/
  );
});

test('shadowing, exposing or replacing the strict assertion object is refused', () => {
  for (const body of [
    `const assert = { equal() {} }; ${expression};`,
    `assert.equal = () => {}; ${expression};`,
    `tamper(assert); ${expression};`,
  ])
    assert.throws(() => locate(unit(body)), /shadowed, reassigned or exposed/);
});

test('duplicate assertion, weakened expectation and unawaited case are refused', () => {
  assert.throws(
    () => locate(unit(`${expression}; ${expression};`)),
    /missing or duplicate exact assertion/
  );
  assert.throws(
    () => locate(unit('assert.equal(after.audit.length, 0);')),
    /missing or duplicate exact assertion/
  );
  assert.throws(
    () => locate(unit(expression + ';').replace('await run(', 'run(')),
    /fixed awaited callback/
  );
});

test('parent cannot record success before actually awaiting the case callback', () => {
  assert.throws(
    () => assertM4AwaitedCaseRunner(parent.replace('await action();', 'action();')),
    /await actual action/
  );
  assert.throws(
    () => assertM4AwaitedCaseRunner(parent.replace('await action();', '')),
    /await actual action/
  );
});

test('source grammar allows comments/layout without crediting different assertion semantics', () => {
  const before = locate(source),
    after = locate(
      source.replace(expression, 'assert.equal( /* actual */ after.audit.length,\n 1 )')
    );
  assert.equal(before.assertionSha256, after.assertionSha256);
  assert.notEqual(before.end, after.end);
});

test('serial projections and cloned-looking objects cannot supply private native or runtime evidence', () => {
  assert.throws(
    () => linkM4EffectAssertions({ version: 1 }, { executed: true }, {}),
    /foreign or serialized handle/
  );
  assert.throws(
    () => assertM4RuntimeImageRecords({ executed: true }, {}, 'fake'),
    /foreign runtime\/image evidence/
  );
});

test('unchanged assertions cannot use a fabricated runtime result or oracle state', () => {
  const variants = [
    source.replace(
      'const after = await state(id);',
      'const after = { audit: [1], result: [1], claim: [{ staffId: staff }] };'
    ),
    source.replace(
      'const result = await runtime.execute(cookie, JSON.stringify(r));',
      'const result = { status: "completed", result: { success: true, data: { id, staffId: staff, assignedAt: "fake" } } };'
    ),
  ];
  for (const variant of variants)
    assert.throws(
      () => mandatoryM4Assertion(variant, fixture, caseId, expression, program),
      /oracle dataflow changed/
    );
});
