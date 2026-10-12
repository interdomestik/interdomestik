import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { createSourceModel } from './db-access-source.mjs';
import { createLocalInvocations } from './db-access-invocations.mjs';

function resolve(source, maxSteps = 512) {
  const file = 'apps/web/src/lib/closure-frame.ts';
  const model = createSourceModel(new Map([[file, source]]));
  const expression = model.parsed.get(file).statements.at(-1).expression;
  assert.ok(ts.isCallExpression(expression));
  return createLocalInvocations(model, {
    isMutated: () => false,
    isEscaped: () => false,
    maxSteps,
  }).resolveCall(expression);
}

for (const length of [2, 4]) {
  test(`finite returned closure chain of ${length} distinct defining frames`, () => {
    const allocations = Array.from(
      { length },
      (_, i) => `const c${i} = lift(${i ? `c${i - 1}` : 'leaf'});`
    ).join('\n');
    const result = resolve(`function lift(next: () => unknown) { return () => next(); }
function leaf() { return { run() { return 1; } }; }
${allocations} c${length - 1}().run();`);
    assert.equal(result.unknown, false, String(result.reasons));
    assert.equal(result.targets.length, 1);
    const [target] = result.targets;
    assert.ok(target.functionNode.getText().startsWith('run()'));
    const closures = target.resolutionInvocations.filter(item =>
      ts.isArrowFunction(item.functionNode)
    );
    assert.equal(closures.length, length);
    assert.equal(new Set(closures.map(item => item.functionNode)).size, 1);
    const parameter = [...closures[0].closureBindings.keys()][0];
    assert.deepEqual(
      new Set(closures.map(item => item.closureBindings.get(parameter).getText())),
      new Set(['leaf', ...Array.from({ length: length - 1 }, (_, i) => `c${i}`)])
    );
  });

  test(`finite own-method link chain of ${length} distinct defining frames`, () => {
    const allocations = Array.from(
      { length },
      (_, i) => `const c${i} = link(${i ? `c${i - 1}` : 'end'});`
    ).join('\n');
    const result = resolve(`function link(next: unknown) { return { go() { return next.go(); } }; }
const end = { go() { return { run() { return 1; } }; } };
${allocations} c${length - 1}.go().run();`);
    assert.equal(result.unknown, false, String(result.reasons));
    assert.equal(result.targets.length, 1);
    const methods = result.targets[0].resolutionInvocations.filter(
      item =>
        ts.isMethodDeclaration(item.functionNode) &&
        item.functionNode.getText().includes('next.go()')
    );
    assert.equal(methods.length, length);
    assert.equal(new Set(methods.map(item => item.functionNode)).size, 1);
  });
}

test('same closure allocation that really calls itself remains unknown', () => {
  const result = resolve(`function lift(next: () => unknown) { return () => next(); }
const a = lift(() => a()); a().run();`);
  assert.equal(result.unknown, true);
  assert.deepEqual(result.targets, []);
  assert.ok(result.reasons.some(reason => reason === 'cycle' || reason === 'recursive-invocation'));
});

test('finite distinct frames still obey the resolution budget', () => {
  const result = resolve(
    `function lift(next: () => unknown) { return () => next(); }
function leaf() { return { run() {} }; }
const a = lift(leaf); const b = lift(a); b().run();`,
    3
  );
  assert.equal(result.unknown, true);
  assert.deepEqual(result.targets, []);
  assert.ok(result.reasons.includes('budget-exceeded'));
});
