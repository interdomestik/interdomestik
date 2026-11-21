import path from 'node:path';

import ts from 'typescript';

import { ScanError } from '../server-mutation/ast.mjs';
import { readInside } from './paths.mjs';

const VITEST_CONFIG = 'apps/web/vitest.config.ts';
const PLAYWRIGHT_CONFIG = 'apps/web/playwright.config.ts';
// The selection both PR-gate projects share: the E2E lane a use's spec must be in (r1 B8). Both
// projects that `pnpm e2e:gate:pr` runs must select it (r2 B4); a renamed project is an error.
// Tags and `grep` inside a spec are not modelled (a named limit).
const E2E_GATE_CONST = 'GATE_DEFAULT_MATCH';
const PR_GATE_PROJECTS = Object.freeze(['gate-ks-sq', 'gate-mk-contract']);

// A lane config, parsed and never run; a config that does not parse is an error (r2 B4).
function parseConfig(root, rel) {
  const text = readInside(root, rel);
  if (text === null) throw new ScanError(`${rel} is missing`);
  if (!text.trim()) throw new ScanError(`${rel} is empty`);
  const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (source.parseDiagnostics?.length) throw new ScanError(`${rel} does not parse`);
  return source;
}

const nameOf = node =>
  node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
    ? node.name.text
    : null;

// A literal list of strings, or null when the node is anything else.
function stringList(node) {
  if (!node || !ts.isArrayLiteralExpression(node)) return null;
  const out = node.elements.map(e => (ts.isStringLiteralLike(e) ? e.text : null));
  return out.includes(null) ? null : out;
}

// The object a config exports by default: `export default {…}` or `export default fn({…})`.
function defaultConfig(source, rel) {
  const exported = source.statements.find(ts.isExportAssignment)?.expression;
  // A later argument is merged over the first (r4 B2): only a single-argument call is read.
  if (exported && ts.isCallExpression(exported) && exported.arguments.length !== 1)
    throw new ScanError(
      `${rel} cannot be read statically (a config call with other than one argument)`
    );
  const object = exported && ts.isCallExpression(exported) ? exported.arguments[0] : exported;
  if (!object || !ts.isObjectLiteralExpression(object))
    throw new ScanError(`${rel} exports no literal config object`);
  return object;
}

// The selection-relevant settings the scanner does not model: one present is an error (r3 B4).
const VITEST_ROOT_UNMODELLED = ['root'];
const VITEST_TEST_UNMODELLED = [
  'dir',
  'root',
  'projects',
  'workspace',
  'includeSource',
  'testNamePattern',
];
const PLAYWRIGHT_UNMODELLED = ['testIgnore', 'grep', 'grepInvert'];
const GATE_PROJECT_UNMODELLED = [...PLAYWRIGHT_UNMODELLED, 'testDir'];

// An object whose fields decide a selection: every member a plain `name: value` with a static
// name, and none of the settings the scanner does not model. A spread, a shorthand, a method or a
// computed name could change the selection, so it is refused, not assumed (r3 B4).
function requireStatic(object, where, unmodelled) {
  for (const property of object.properties) {
    const name = nameOf(property);
    if (!ts.isPropertyAssignment(property) || name === null)
      throw new ScanError(`${where} cannot be read statically (${ts.SyntaxKind[property.kind]})`);
    if (unmodelled.includes(name)) throw new ScanError(`${where}.${name} is not modelled`);
  }
  return object;
}

// The initializer of one property of an object literal (its own properties only), or null.
function ownProperty(object, name) {
  const found = object?.properties.filter(p => ts.isPropertyAssignment(p) && nameOf(p) === name);
  return found?.length === 1 ? found[0].initializer : null;
}

// The top-level `const` initializer of a name.
function topLevelConst(source, name) {
  for (const statement of source.statements)
    if (ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations)
        if (nameOf(declaration) === name) return declaration.initializer ?? null;
  return null;
}

// Whether a project's testMatch is the gate list or a literal list that spreads it.
function selectsGate(source, expression) {
  if (!expression || !ts.isIdentifier(expression)) return false;
  if (expression.text === E2E_GATE_CONST) return true;
  const list = topLevelConst(source, expression.text);
  return Boolean(
    list &&
    ts.isArrayLiteralExpression(list) &&
    list.elements.some(
      e =>
        ts.isSpreadElement(e) &&
        ts.isIdentifier(e.expression) &&
        e.expression.text === E2E_GATE_CONST
    )
  );
}

function readVitestLane(root) {
  const config = requireStatic(
    defaultConfig(parseConfig(root, VITEST_CONFIG), VITEST_CONFIG),
    VITEST_CONFIG,
    VITEST_ROOT_UNMODELLED
  );
  const test = ownProperty(config, 'test');
  if (!test || !ts.isObjectLiteralExpression(test))
    throw new ScanError(`${VITEST_CONFIG} has no literal test object`);
  requireStatic(test, `${VITEST_CONFIG} test`, VITEST_TEST_UNMODELLED);
  const include = stringList(ownProperty(test, 'include'));
  if (!include?.length) throw new ScanError(`${VITEST_CONFIG} names no literal test.include list`);
  const excludeNode = ownProperty(test, 'exclude');
  const exclude = excludeNode ? stringList(excludeNode) : [];
  if (exclude === null) throw new ScanError(`${VITEST_CONFIG} test.exclude is not a literal list`);
  return { include, exclude };
}

function readE2eLane(root) {
  const source = parseConfig(root, PLAYWRIGHT_CONFIG);
  const config = requireStatic(
    defaultConfig(source, PLAYWRIGHT_CONFIG),
    PLAYWRIGHT_CONFIG,
    PLAYWRIGHT_UNMODELLED
  );
  const testDir = ownProperty(config, 'testDir');
  if (!testDir || !ts.isStringLiteralLike(testDir))
    throw new ScanError(`${PLAYWRIGHT_CONFIG} names no literal testDir`);
  const e2eMatch = stringList(topLevelConst(source, E2E_GATE_CONST));
  if (!e2eMatch?.length)
    throw new ScanError(`${PLAYWRIGHT_CONFIG} names no literal ${E2E_GATE_CONST} list`);
  const projects = ownProperty(config, 'projects');
  const elements = projects && ts.isArrayLiteralExpression(projects) ? projects.elements : [];
  for (const name of PR_GATE_PROJECTS) {
    const project = elements.find(
      e => ts.isObjectLiteralExpression(e) && ownProperty(e, 'name')?.text === name
    );
    if (project) requireStatic(project, `${PLAYWRIGHT_CONFIG} ${name}`, GATE_PROJECT_UNMODELLED);
    if (!selectsGate(source, ownProperty(project, 'testMatch')))
      throw new ScanError(`${PLAYWRIGHT_CONFIG}: ${name} does not select ${E2E_GATE_CONST}`);
  }
  return {
    e2eDir: path.posix.normalize(path.posix.join('apps/web', testDir.text)),
    e2eMatch,
  };
}

// The lane selections, parsed from the lane configs without running them (r1 B8, r2 B4).
export function readLanes(root) {
  return { vitest: readVitestLane(root), ...readE2eLane(root) };
}

// A Vitest exclude entry without glob characters names that path or a directory anywhere in it.
const excludeGlobs = entry =>
  /[*?{[]/u.test(entry) ? [entry] : [entry, `${entry}/**`, `**/${entry}`, `**/${entry}/**`];

function inLane(lanes, rel) {
  if (rel.startsWith(`${lanes.e2eDir}/`)) {
    const inner = rel.slice(lanes.e2eDir.length + 1);
    return lanes.e2eMatch.some(glob => path.matchesGlob(inner, glob));
  }
  if (!rel.startsWith('apps/web/')) return false;
  const inner = rel.slice('apps/web/'.length);
  if (!lanes.vitest.include.some(glob => path.matchesGlob(inner, glob))) return false;
  return !lanes.vitest.exclude.flatMap(excludeGlobs).some(glob => path.matchesGlob(inner, glob));
}

export { inLane };
