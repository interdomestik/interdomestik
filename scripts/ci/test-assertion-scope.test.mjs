import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

// Check lexical module scope, including top-level blocks and initializers. Assertions in
// tests, lifecycle hooks and helper functions are permitted; this is not call-graph analysis.
function moduleAssertions(source, name = 'fixture.mjs') {
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const options = { allowJs: true, noLib: true, noResolve: true };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = path => (path === name ? file : undefined);
  host.fileExists = path => path === name;
  host.readFile = path => (path === name ? source : undefined);
  const program = ts.createProgram([name], options, host);
  const checker = program.getTypeChecker();
  const imported = new Set();
  for (const statement of file.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !['node:assert', 'node:assert/strict'].includes(statement.moduleSpecifier.text)
    )
      continue;
    const clause = statement.importClause;
    const bindings = clause?.namedBindings;
    const names = [clause?.name];
    if (bindings && ts.isNamespaceImport(bindings)) names.push(bindings.name);
    else if (bindings) names.push(...bindings.elements.map(item => item.name));
    for (const name of names.filter(Boolean)) imported.add(checker.getSymbolAtLocation(name));
  }
  imported.delete(undefined);
  function assertionReference(raw, seen = new Set()) {
    const node = ts.skipOuterExpressions(raw);
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
      return assertionReference(node.expression, seen);
    if (!ts.isIdentifier(node)) return false;
    const symbol = checker.getSymbolAtLocation(node);
    if (!symbol || seen.has(symbol)) return false;
    if (imported.has(symbol)) return true;
    seen.add(symbol);
    const declaration = symbol.valueDeclaration;
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer)
      return assertionReference(declaration.initializer, seen);
    if (declaration && ts.isBindingElement(declaration)) {
      let holder = declaration.parent.parent;
      while (ts.isBindingElement(holder)) holder = holder.parent.parent;
      if (ts.isVariableDeclaration(holder) && holder.initializer)
        return assertionReference(holder.initializer, seen);
    }
    return false;
  }
  const failures = [];
  const visit = node => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isCallExpression(node) && assertionReference(node.expression)) {
      const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file));
      failures.push({ line: line + 1, column: character + 1, call: node.expression.getText(file) });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return failures;
}

for (const source of [
  "import assert from 'node:assert/strict'; assert.equal(graphSource.split(memoLine).length, 2);",
  "import check from 'node:assert'; check(true);",
  "import * as verify from 'node:assert/strict'; verify.equal(1, 1);",
  "import { strictEqual as equal } from 'node:assert'; equal(1, 1);",
  "import { strict as verify } from 'node:assert'; verify.equal(1, 1);",
  "import assert from 'node:assert/strict'; const { equal: same } = assert; same(1, 1);",
  "import assert from 'node:assert/strict'; const same = assert.equal; same(1, 1);",
  "import assert from 'node:assert/strict'; if (ready) { assert.ok(ready); }",
  "import assert from 'node:assert/strict'; const value = assert['equal'](1, 1);",
]) {
  test(`rejects module assertion: ${source}`, () => {
    assert.equal(moduleAssertions(source).length, 1);
  });
}

test('accepts assertions inside tests, lifecycle hooks and helper functions', () => {
  assert.deepEqual(
    moduleAssertions(`
    import assert from 'node:assert/strict';
    import { before, test } from 'node:test';
    before(() => { assert.equal(1, 1); });
    test('works', () => assert.ok(true));
    function helper() { assert.equal(1, 1); }
    const otherHelper = () => assert.ok(true);
  `),
    []
  );
});

test('ignores fixture strings, regexes, comments and unrelated or shadowed assertion names', () => {
  assert.deepEqual(
    moduleAssertions(`
    import assert from 'node:assert/strict';
    import other from 'another-assertion-library';
    const fixture = "assert.equal(1, 1)";
    const pattern = /assert.equal(1, 1)/;
    // assert.equal(1, 1);
    other.equal(1, 1);
    { const assert = { equal() {} }; assert.equal(1, 1); }
  `),
    []
  );
});

test('CI tests place node:assert calls inside tests, hooks or helpers', () => {
  const directory = new URL('.', import.meta.url);
  const failures = fs
    .readdirSync(directory)
    .filter(name => name.endsWith('.test.mjs'))
    .sort()
    .flatMap(name =>
      moduleAssertions(fs.readFileSync(new URL(name, directory), 'utf8'), name).map(
        item => `${name}:${item.line}:${item.column} ${item.call}`
      )
    );
  assert.deepEqual(
    failures,
    [],
    'Move module-scope assertions into a node:test lifecycle hook or test.'
  );
});
