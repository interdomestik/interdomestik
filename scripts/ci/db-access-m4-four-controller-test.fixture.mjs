import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import { deriveM4AssignmentControllers, FILES } from './db-access-m4-four-controller-source.mjs';
const root = process.env.M4_FOUR_CONTROLLER_TEST_ROOT ?? path.resolve(import.meta.dirname, '../..');
const sources = Object.fromEntries(
  Object.entries(FILES).map(([key, file]) => [
    key + 'Source',
    fs.readFileSync(path.join(root, file), 'utf8'),
  ])
);
const derive = patch => deriveM4AssignmentControllers({ ...sources, ...patch });
const hash = text => createHash('sha256').update(text).digest('hex');
const baseline = derive();
const replace = (source, before, after) => {
  assert.equal(source.split(before).length, 2, 'unique mutation anchor: ' + before);
  return source.replace(before, after);
};
function parse(source) {
  return ts.createSourceFile('mutant.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
}
function nodes(source, predicate) {
  const ast = parse(source),
    result = [];
  function visit(n) {
    if (predicate(n, ast)) result.push(n);
    ts.forEachChild(n, visit);
  }
  visit(ast);
  return { ast, result };
}
function mutateNode(source, predicate, replacement) {
  const { ast, result } = nodes(source, predicate);
  assert.equal(result.length, 1, 'unique AST mutation anchor');
  const node = result[0];
  return (
    source.slice(0, node.getStart(ast)) +
    (typeof replacement === 'function' ? replacement(node, ast) : replacement) +
    source.slice(node.getEnd())
  );
}
const callNamed = (node, name) => ts.isCallExpression(node) && node.expression.getText() == name;
const transactionStatement = (source, predicate, replacement) =>
  mutateNode(source, (n, a) => ts.isStatement(n) && predicate(n.getText(a), n, a), replacement);
const fingerprintArray = (n, a) =>
  ts.isArrayLiteralExpression(n) && n.elements[0]?.getText(a) === 'request.version';
const fingerprintElement = (source, index, replacement) =>
  mutateNode(
    source,
    fingerprintArray,
    (node, ast) =>
      '[' +
      node.elements.map((n, i) => (i === index ? replacement : n.getText(ast))).join(',') +
      ']'
  );
const insertStatement = (text, n) =>
  ts.isExpressionStatement(n) &&
  text.startsWith('await tx') &&
  text.includes('.insert(schema.operationResults)');
const negative = (label, mutate, key = 'controllerSource') =>
  test(label + ' rejects with fresh syntactically valid source', () => {
    const changed = mutate(sources[key]);
    assert.notEqual(hash(changed), hash(sources[key]));
    assert.equal(parse(changed).parseDiagnostics.length, 0, 'semantic mutant parses normally');
    assert.throws(() => derive({ [key]: changed }), /^Error: m4 controller source rejected:/);
  });
export function registerPositiveControllerCases() {
  test('actual fixed four bindings derive with source hashes, ordered callback and unresolved premises', () => {
    assert.equal(baseline.runtimeAdmission, false);
    assert.equal(baseline.controllerPremiseOnly, true);
    assert.equal(Object.keys(baseline.facts.controller.functions).length, 5);
    assert.equal(baseline.facts.ownedClauses.length, 23);
    for (const [key, file] of Object.entries(FILES))
      assert.equal(baseline.sourceSha256[file], hash(sources[key + 'Source']));
    assert.ok(baseline.sourceNodes.length > 100);
    assert.ok(baseline.premises.some(x => x.includes('bootstrap')));
    assert.ok(baseline.premises.some(x => x.includes('notifier')));
    assert.ok(Object.isFrozen(baseline.facts.controller.functions));
    assert.throws(() => {
      baseline.runtimeAdmission = true;
    }, TypeError);
  });
  test('comments layout and local renaming preserve finite facts', () => {
    const changed =
      '// artifact comment\n' +
      sources.controllerSource
        .replace(/\bprincipal\b/g, 'admittedPrincipal')
        .replace(/\bprevious\b/g, 'storedOperation');
    assert.equal(derive({ controllerSource: changed }).factsSha256, baseline.factsSha256);
  });
  test('actual import alias identity is preserved', () => {
    const changed = sources.controllerSource
      .replace('{ and, eq, sql }', '{ and, eq as equal, sql }')
      .replace(/\beq\(/g, 'equal(');
    assert.equal(derive({ controllerSource: changed }).factsSha256, baseline.factsSha256);
  });
}
export {
  sources,
  derive,
  hash,
  baseline,
  replace,
  nodes,
  mutateNode,
  callNamed,
  transactionStatement,
  fingerprintElement,
  insertStatement,
  negative,
};
