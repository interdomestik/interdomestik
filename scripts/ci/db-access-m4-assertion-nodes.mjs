// Bounded source/control inspection, never runtime evidence or admission authority.
import ts from 'typescript';
import { createHash } from 'node:crypto';

const fail = reason => {
  throw Error('M4 assertion correspondence refused: ' + reason);
};
const hash = value => createHash('sha256').update(value).digest('hex');
function tokens(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
  const result = [];
  for (let kind; (kind = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken;)
    result.push([kind, scanner.getTokenText()]);
  return JSON.stringify(result);
}
function functionBoundary(node) {
  return (
    ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
  );
}
function strictBinding(unit) {
  function visit(node) {
    if (ts.isIdentifier(node) && node.text === 'assert') {
      if (ts.isImportClause(node.parent) && node.parent.name === node) return;
      let access = node;
      while (ts.isPropertyAccessExpression(access.parent) && access.parent.expression === access)
        access = access.parent;
      if (!ts.isCallExpression(access.parent) || access.parent.expression !== access)
        fail('assertion binding is shadowed, reassigned or exposed');
    }
    ts.forEachChild(node, visit);
  }
  visit(unit);
}
function noSuccessfulEscape(body) {
  function visit(node) {
    if (node !== body && functionBoundary(node)) return;
    if (ts.isReturnStatement(node) || ts.isCatchClause(node))
      fail('case has a return or catch that could bypass its required assertion');
    ts.forEachChild(node, visit);
  }
  visit(body);
}

// The selected assertion must be a direct expression statement on every successful
// completion path. Conditional/loop/nested-callback assertions receive no credit.
export function mandatoryM4Assertion(source, file, caseId, expression, expectedProgram) {
  const unit = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (unit.parseDiagnostics.length) fail('fixture parse');
  const imports = unit.statements.filter(
    node => ts.isImportDeclaration(node) && node.importClause?.name?.text === 'assert'
  );
  if (imports.length !== 1 || imports[0].moduleSpecifier.text !== 'node:assert/strict')
    fail('strict assertion binding');
  strictBinding(unit);
  const cases = [];
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'run' &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text === caseId
    )
      cases.push(node);
    ts.forEachChild(node, visit);
  }
  visit(unit);
  if (cases.length !== 1) fail('missing or duplicate fixed case');
  const call = cases[0],
    callback = call.arguments[1];
  if (
    call.arguments.length !== 2 ||
    !ts.isAwaitExpression(call.parent) ||
    !ts.isExpressionStatement(call.parent.parent) ||
    !ts.isArrowFunction(callback) ||
    !callback.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword) ||
    callback.parameters.length ||
    !ts.isBlock(callback.body)
  )
    fail('fixed awaited callback');
  noSuccessfulEscape(callback.body);
  const expected = tokens(expression),
    matches = [];
  function collect(node) {
    if (node !== callback.body && functionBoundary(node)) return;
    if (ts.isCallExpression(node) && tokens(node.getText(unit)) === expected) matches.push(node);
    ts.forEachChild(node, collect);
  }
  collect(callback.body);
  if (matches.length !== 1) fail('missing or duplicate exact assertion');
  const node = matches[0];
  if (
    !ts.isPropertyAccessExpression(node.expression) ||
    !ts.isIdentifier(node.expression.expression) ||
    node.expression.expression.text !== 'assert' ||
    !['equal', 'deepEqual'].includes(node.expression.name.text) ||
    !ts.isExpressionStatement(node.parent)
  )
    fail('direct strict assertion');
  let statement = node.parent;
  while (statement.parent !== callback.body) {
    if (!ts.isBlock(statement.parent)) fail('assertion is conditional or nested');
    const block = statement.parent,
      owner = block.parent;
    if (!ts.isTryStatement(owner) || owner.tryBlock !== block || owner.catchClause)
      fail('assertion is conditional or nested');
    statement = owner;
  }
  const program = tokens(callback.getText(unit));
  if (expectedProgram !== undefined && program !== tokens(expectedProgram))
    fail('fixed assertion program or oracle dataflow changed');
  const start = node.getStart(unit);
  return Object.freeze({
    file,
    caseId,
    start,
    end: node.getEnd(),
    line: unit.getLineAndCharacterOfPosition(start).line + 1,
    assertionSha256: hash(expected),
    callbackSha256: hash(program),
    mandatoryOnSuccessfulCallback: true,
  });
}

export function assertM4AwaitedCaseRunner(source) {
  const unit = ts.createSourceFile(
    'fixture.mjs',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  if (unit.parseDiagnostics.length) fail('parent fixture parse');
  const runners = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'run')
      runners.push(node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(unit);
  const runner = runners[0];
  if (
    runners.length !== 1 ||
    !runner ||
    !ts.isArrowFunction(runner) ||
    !runner.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword) ||
    runner.parameters.length !== 2 ||
    runner.parameters[0].name.getText(unit) !== 'id' ||
    runner.parameters[1].name.getText(unit) !== 'action' ||
    tokens(runner.body.getText(unit)) !==
      tokens('{ stage = id; await action(); cases.push({ id, passed: true }); }')
  )
    fail('parent must await actual action before recording passed case');
}
