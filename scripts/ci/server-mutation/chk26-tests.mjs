// CHK-26 denied tests (design §6.2, r4 B3, r5 B3): a non-skipped test in a CI lane calls that
// exported method, asserts the denial status, and asserts zero calls on the mock of that effect.
import ts from 'typescript';

import { importsOf, resolveModule, textOf, unwrap } from './ast.mjs';

const LANE_RE = /^apps\/web\/src\/.*\.test\.tsx?$/u; // apps/web vitest include: src/**/*.test.{ts,tsx}
const DENIAL_STATUSES = new Set(['401', '403', '404']);
const TEST_CALLEES = new Set(['it', 'test']);
const SUITE = 'describe';

const isTitle = (node, title) =>
  node &&
  (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
  node.text === title;

export function findTest(sf, title) {
  let hit = null;
  sf.forEachChild(function visit(node) {
    if (
      !hit &&
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      TEST_CALLEES.has(node.expression.text)
    )
      if (isTitle(node.arguments[0], title)) hit = node;
    node.forEachChild(visit);
  });
  return hit;
}

// Every enclosing suite must be a plain `describe(...)`: no .skip, .todo, .skipIf or .only chains.
function suitesPlain(test) {
  for (let node = test.parent; node; node = node.parent) {
    if (!ts.isCallExpression(node)) continue;
    const callee = node.expression;
    const root =
      ts.isPropertyAccessExpression(callee) || ts.isCallExpression(callee) ? textOf(callee) : null;
    if (root?.startsWith(`${SUITE}.`) || root?.startsWith(`${SUITE}(`)) return false;
  }
  return true;
}

function returnedObject(factory) {
  const fn = unwrap(factory);
  if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return null;
  const body = unwrap(fn.body);
  if (ts.isObjectLiteralExpression(body)) return body;
  const ret = ts.isBlock(fn.body) && fn.body.statements.findLast(ts.isReturnStatement);
  const value = ret && unwrap(ret.expression);
  return value && ts.isObjectLiteralExpression(value) ? value : null;
}

const resolvedSpecifier = (root, testPath, specifier) =>
  resolveModule(root, testPath, specifier) ?? specifier;

// Texts the factory of one `vi.mock(...)` call gives the effect's export, if it mocks its module.
function mockFactoryTexts(root, testPath, node, effect) {
  const [spec, factory] = node.arguments;
  if (!spec || !ts.isStringLiteral(spec) || !factory) return [];
  if (resolvedSpecifier(root, testPath, spec.text) !== effect.module) return [];
  const texts = [];
  for (const property of returnedObject(factory)?.properties ?? []) {
    if (ts.isPropertyAssignment(property) && property.name.getText() === effect.imported)
      texts.push(textOf(property.initializer));
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === effect.imported)
      texts.push(property.name.text);
  }
  return texts;
}

// The texts that denote the effect's mock in the test file.
function effectMockTexts(root, sf, testPath, effect) {
  const out = new Set();
  sf.forEachChild(function visit(node) {
    if (ts.isCallExpression(node) && textOf(node.expression) === 'vi.mock')
      for (const text of mockFactoryTexts(root, testPath, node, effect)) out.add(text);
    node.forEachChild(visit);
  });
  for (const [local, imported] of importsOf(sf))
    if (
      imported.imported === effect.imported &&
      resolvedSpecifier(root, testPath, imported.specifier) === effect.module
    )
      out.add(local);
  return out;
}

function expectations(body) {
  const out = [];
  body.forEachChild(function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      let receiver = node.expression.expression;
      const negated = ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'not';
      if (negated) receiver = receiver.expression;
      if (ts.isCallExpression(receiver) && textOf(receiver.expression) === 'expect')
        out.push({
          subject: textOf(receiver.arguments[0] ?? receiver),
          matcher: node.expression.name.text,
          negated,
          args: node.arguments.map(textOf),
        });
    }
    node.forEachChild(visit);
  });
  return out;
}

const assertsStatus = (list, allowed) =>
  list.some(
    e =>
      !e.negated &&
      ['toBe', 'toEqual', 'toStrictEqual'].includes(e.matcher) &&
      allowed.has(e.args[0] ?? '') &&
      /status$/u.test(e.subject)
  );

const assertsZeroCalls = (list, mocks) =>
  list.some(
    e =>
      mocks.has(e.subject) &&
      ((e.negated && e.matcher === 'toHaveBeenCalled' && e.args.length === 0) ||
        (!e.negated && e.matcher === 'toHaveBeenCalledTimes' && e.args[0] === '0'))
  );

// Problem text, or null when the denied test proves the denial for this method and effect.
export function deniedTestProblem({ root, entry, parse, effect }) {
  const { path: testPath, title } = entry.deniedTest;
  if (!LANE_RE.test(testPath)) return 'denied test is not in a CI test lane';
  const sf = parse(testPath);
  if (!sf) return 'denied test file does not exist';
  const test = findTest(sf, title);
  if (!test) return 'denied test title not found (or skipped)';
  if (!suitesPlain(test)) return 'denied test sits in a skipped or filtered suite';
  const body = test.arguments[1];
  if (!body) return 'denied test has no body';
  const local = [...importsOf(sf)].find(
    ([, imported]) =>
      imported.imported === entry.method &&
      resolveModule(root, testPath, imported.specifier) === entry.module
  )?.[0];
  if (!local) return 'denied test does not import that method from the route module';
  let calls = false;
  body.forEachChild(function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === local
    )
      calls = true;
    node.forEachChild(visit);
  });
  if (!calls) return 'denied test does not call that method';
  const list = expectations(body);
  if (entry.authentication === 'closed-410')
    return assertsStatus(list, new Set(['410'])) ? null : 'no 410 assertion';
  if (!assertsStatus(list, DENIAL_STATUSES)) return 'no 401/403/404 status assertion';
  if (!effect) return 'effect import not resolvable';
  return assertsZeroCalls(list, effectMockTexts(root, sf, testPath, effect))
    ? null
    : 'no zero-call assertion on the effect mock';
}
