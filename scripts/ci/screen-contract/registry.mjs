// The consent registry of CHK-22 (WP-05 design §2.1): schema, the trusted-base comparison and the
// per-kind test evidence. The lint rule reads the same parsed registry through `registryFor`.
import path from 'node:path';

import ts from 'typescript';

import { ScanError, byCodeUnit } from '../server-mutation/ast.mjs';
import { multisetMinus } from '../server-mutation/baseline.mjs';
import { isCanonicalSource, isPlainPath, readInside } from './paths.mjs';
import { resolverFor } from './specifiers.mjs';

export const REGISTRY_PATH = 'scripts/ci/screen-contract/consent-registry.json';
const KINDS = new Set(['consent', 'selection', 'not-consent']);
const SUBMISSION_RE = /^[^#\s]+#[A-Za-z_$][\w$]*$/u;
const REQUIRED_BY_KIND = Object.freeze({
  consent: ['payloadField', 'storedIn', 'versionSource'],
  selection: ['selectedRecord', 'storedIn'],
  'not-consent': ['reason'],
});
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim() !== '';

// Every path the registry names is checked before any file is read (r3 B1): a source file is a
// canonical linted source; a test is a plain repository path.
function requireSource(rel, what) {
  if (!isCanonicalSource(rel)) throw new ScanError(`${what} ${rel} is not a canonical source path`);
}

function validateUse(use, where, seen) {
  if (!isPlainObject(use)) throw new ScanError(`${where} is not an object`);
  for (const key of ['useId', 'file', 'submission', 'test'])
    if (!isText(use[key])) throw new ScanError(`${where} has no ${key}`);
  if (!SUBMISSION_RE.test(use.submission))
    throw new ScanError(`${where} submission is not <module path>#<export>`);
  requireSource(use.file, `${where} file`);
  requireSource(use.submission.split('#')[0], `${where} submission`);
  if (!isPlainPath(use.test)) throw new ScanError(`${where} test ${use.test} is not a plain path`);
  if (seen.has(use.useId)) throw new ScanError(`${where} repeats useId ${use.useId}`);
  seen.add(use.useId);
}

function validateFields(entry, where) {
  for (const key of ['id', 'file', 'control'])
    if (!isText(entry[key])) throw new ScanError(`${where} has no ${key}`);
  if (!/^[\w.-]+$/u.test(entry.id)) throw new ScanError(`${where} has an id with spaces or ':'`);
  requireSource(entry.file, `${where} file`);
  if (!KINDS.has(entry.kind)) throw new ScanError(`${where} has an unknown kind`);
  for (const key of REQUIRED_BY_KIND[entry.kind])
    if (!isText(entry[key])) throw new ScanError(`${where} (${entry.kind}) has no ${key}`);
  if (entry.exportName !== undefined && !isText(entry.exportName))
    throw new ScanError(`${where} has an empty exportName`);
  if (entry.selfSubmitting !== undefined && typeof entry.selfSubmitting !== 'boolean')
    throw new ScanError(`${where} has a non-boolean selfSubmitting`);
}

function validateAliases(entry, where) {
  const aliases = entry.aliases ?? [];
  if (
    !Array.isArray(aliases) ||
    !aliases.every(a => isPlainObject(a) && isText(a.file) && isText(a.exportName))
  )
    throw new ScanError(`${where} has malformed aliases`);
  for (const alias of aliases) requireSource(alias.file, `${where} alias file`);
  return aliases;
}

function validateUses(entry, where) {
  const uses = entry.uses ?? [];
  if (!Array.isArray(uses)) throw new ScanError(`${where} uses is not a list`);
  if (entry.kind === 'not-consent' && uses.length)
    throw new ScanError(`${where} (not-consent) has uses`);
  const seen = new Set();
  uses.forEach((use, i) => validateUse(use, `${where} use ${i}`, seen));
  if (entry.selfSubmitting && (uses.length !== 1 || uses[0].file !== entry.file))
    throw new ScanError(`${where} is selfSubmitting with other than one use in its own file`);
  // An exported control is judged only at its renders' boundaries. With no use nothing would ever
  // judge it (a route's component has no JSX caller), so it needs a use or selfSubmitting (r5 B2).
  if (entry.exportName && entry.kind !== 'not-consent' && !entry.selfSubmitting && !uses.length)
    throw new ScanError(`${where} has an exportName but no use and is not selfSubmitting`);
  return uses;
}

function validateEntry(entry, index) {
  const where = `consent registry entry ${index}`;
  if (!isPlainObject(entry)) throw new ScanError(`${where} is not an object`);
  validateFields(entry, where);
  const aliases = validateAliases(entry, where);
  const uses = validateUses(entry, where);
  return { ...entry, aliases, uses };
}

// Parses a registry text: { version: 1, entries: [...] } -> Map id -> entry. `entries: []` is
// legal and fails closed (every candidate is then unregistered).
export function parseRegistry(text, label = 'consent registry') {
  if (typeof text !== 'string' || !text.trim()) throw new ScanError(`${label} is missing or empty`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ScanError(`${label} is not valid JSON`);
  }
  if (!isPlainObject(data) || data.version !== 1) throw new ScanError(`${label} has no version 1`);
  if (!Array.isArray(data.entries)) throw new ScanError(`${label} has no entries list`);
  const out = new Map();
  data.entries.forEach((raw, index) => {
    const entry = validateEntry(raw, index);
    if (out.has(entry.id)) throw new ScanError(`${label} has a duplicate id ${entry.id}`);
    out.set(entry.id, entry);
  });
  return out;
}

const registries = new Map();

// The registry of a target tree, parsed once per process.
export function registryFor(root) {
  if (!registries.has(root)) {
    const text = readInside(root, REGISTRY_PATH) ?? '';
    registries.set(root, parseRegistry(text, 'head consent registry'));
  }
  return registries.get(root);
}

const BOUND_FIELDS = [
  'kind',
  'file',
  'control',
  'exportName',
  'storedIn',
  'payloadField',
  'selectedRecord',
];
const USE_FIELDS = ['file', 'submission', 'test'];
const exceptionKey = e => `${e.check}\u0000${e.item}\u0000${e.kind}`;

// Tamper findings of the registry against the trusted base (§2.1 "Judged against the trusted
// base"); each needs the owner's fresh `#registry:<id>` exception of CHK-22.
export function registryTamper(baseRegistry, headRegistry, base, head, isRendered) {
  if (!baseRegistry) {
    return [...headRegistry.values()]
      .filter(entry => entry.kind === 'not-consent')
      .filter(entry => !freshFor(base, head, entry.id))
      .map(entry => `CHK-22#registry-not-consent:${entry.id}`);
  }
  const out = [];
  for (const [id, before] of baseRegistry)
    out.push(...entryTamper(id, before, headRegistry.get(id), isRendered));
  for (const [id, entry] of headRegistry)
    if (!baseRegistry.has(id) && entry.kind === 'not-consent')
      out.push(`CHK-22#registry-not-consent:${id}`);
  // One fresh exception per entry admits every change of that entry.
  return out.filter(finding => !freshFor(base, head, idOfFinding(finding)));
}

// The changes of one base entry in the head: removed, a bound field changed, a use or alias removed.
function entryTamper(id, before, after, isRendered) {
  if (!after) return isRendered(before) ? [`CHK-22#registry-removed:${id}`] : [];
  const out = [];
  for (const field of BOUND_FIELDS)
    if (before[field] !== after[field]) out.push(`CHK-22#registry-changed-${field}:${id}`);
  const uses = new Map(after.uses.map(use => [use.useId, use]));
  for (const use of before.uses) {
    const now = uses.get(use.useId);
    if (!now) out.push(`CHK-22#registry-removed-use:${id}:${use.useId}`);
    // A use is its file, submission and test; keeping only its useId is a change (r1 H3).
    else if (USE_FIELDS.some(field => now[field] !== use[field]))
      out.push(`CHK-22#registry-changed-use:${id}:${use.useId}`);
  }
  const aliasKeys = new Set(after.aliases.map(a => `${a.file}#${a.exportName}`));
  for (const alias of before.aliases)
    if (!aliasKeys.has(`${alias.file}#${alias.exportName}`))
      out.push(`CHK-22#registry-removed-alias:${id}:${alias.file}#${alias.exportName}`);
  return out;
}

const idOfFinding = finding => finding.split(':')[1];

function freshFor(base, head, id) {
  const fresh = multisetMinus(
    (head?.exceptions ?? []).map(exceptionKey),
    (base?.exceptions ?? []).map(exceptionKey)
  );
  return ['replaced', 'downgrade', 'added'].some(kind =>
    fresh.includes(exceptionKey({ check: 'CHK-22', item: `#registry:${id}`, kind }))
  );
}

const SKIPPED_RE =
  /\b(?:it|test|describe|suite)\s*\.\s*(?:skip|todo|fixme)\b|\bx(?:it|describe)\s*\(/u;
const TEST_FUNCTIONS = new Set(['it', 'test', 'describe', 'suite']);

// Whether a test imports a test function under another name (`import { suite as s }`): a skip
// through that name is not seen, so such a test is no evidence at all (fail closed, r7 B3).
function renamesTestFunction(rel, text) {
  const kind = /\.[jt]sx$/u.test(rel) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
  return nodesOf(source).some(
    node =>
      ts.isImportSpecifier(node) &&
      node.propertyName !== undefined &&
      TEST_FUNCTIONS.has(node.propertyName.text) &&
      node.propertyName.text !== node.name.text
  );
}
// A time-field name ends in one of these (`createdAt`, `granted_at`, `timestamp`); the regex only
// tests for one, so the leading word characters need no match of their own.
const TIME_RE = /(?:At|_at|Time|time|timestamp)\b/u;

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

// Every node of a source file, depth first.
function nodesOf(source) {
  const out = [];
  const visit = node => {
    out.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

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

// How a test file binds the registered export (r2 B5, r3 B3), by symbol, not by name: every
// imported specifier, and the value imports of `exportName` (named or aliased) and the namespace
// imports, each with whether the file holds a value reference to that very binding. A type-only
// import, a `typeof` or other type position, a property key, and a shadowing local are no use; a
// shorthand property `{ saveTerms }` is.
function bindingFacts(rel, text, exportName) {
  const { source, checker } = checkedFile(rel, text);
  const imports = [];
  const bindings = []; // { spec, kind: 'named' | 'namespace', symbol }
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier))
      continue;
    const spec = statement.moduleSpecifier.text;
    imports.push(spec);
    if (statement.importClause?.isTypeOnly) continue;
    for (const { kind, name } of valueImports(statement.importClause, exportName))
      bindings.push({ spec, kind, symbol: checker.getSymbolAtLocation(name) });
  }
  const used = referencedSymbols(source, checker, exportName);
  return {
    imports,
    bindings: bindings.map(({ spec, kind, symbol }) => ({
      spec,
      kind,
      used: Boolean(symbol) && used[kind].has(symbol),
    })),
  };
}

// The import names of one clause that can carry the export as a value; a default import carries
// `default` (r5 B5).
function valueImports(clause, exportName) {
  const out =
    clause?.name && exportName === 'default' ? [{ kind: 'named', name: clause.name }] : [];
  return [...out, ...boundImports(clause, exportName)];
}

function boundImports(clause, exportName) {
  const named = clause?.namedBindings;
  if (named && ts.isNamespaceImport(named)) return [{ kind: 'namespace', name: named.name }];
  if (!named || !ts.isNamedImports(named)) return [];
  return named.elements
    .filter(e => !e.isTypeOnly && (e.propertyName ?? e.name).text === exportName)
    .map(e => ({ kind: 'named', name: e.name }));
}

// One source file bound by TypeScript's checker on its own (no other file, no lib), so a symbol
// identifies a binding as scope analysis does.
function checkedFile(rel, text) {
  const fileName = `/${rel}`;
  const kind = /\.[jt]sx$/u.test(rel) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const options = { noResolve: true, noLib: true, allowJs: true, jsx: ts.JsxEmit.Preserve };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = name => (name === fileName ? source : undefined);
  host.fileExists = name => name === fileName;
  host.readFile = name => (name === fileName ? text : undefined);
  const program = ts.createProgram({ rootNames: [fileName], options, host });
  return { source: program.getSourceFile(fileName), checker: program.getTypeChecker() };
}

// Whether a node sits in a type position (a type annotation, `typeof x`, a type alias).
function inTypePosition(node) {
  for (let at = node.parent; at && !ts.isSourceFile(at); at = at.parent)
    if (ts.isTypeNode(at) && !ts.isExpressionWithTypeArguments(at)) return true;
  return false;
}

// Whether a reference only forwards its value through `export default`: the node, through
// parentheses, type assertions (`as` and `<T>`) or as the object of a member access, is the exported
// expression (r6 B4: `export default (s)`, `export default ns.s`; r7 B2: `export default <T>s`).
function forwardedByDefaultExport(node) {
  let at = node;
  while (
    ts.isParenthesizedExpression(at.parent) ||
    ts.isAsExpression(at.parent) ||
    ts.isTypeAssertionExpression(at.parent) ||
    ts.isSatisfiesExpression(at.parent) ||
    ts.isNonNullExpression(at.parent) ||
    (ts.isPropertyAccessExpression(at.parent) && at.parent.expression === at)
  )
    at = at.parent;
  return ts.isExportAssignment(at.parent);
}

// The symbol a value-position identifier refers to, or null (an import name, a property key or
// member name, a declared name, or a type position).
function valueSymbol(node, checker) {
  const parent = node.parent;
  if (ts.isShorthandPropertyAssignment(parent) && parent.name === node)
    return checker.getShorthandAssignmentValueSymbol(parent) ?? null;
  if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent))
    return null;
  // A re-export is no use in a test: a type-only one is erased, and none calls it (r4 B1, r5 B5).
  if (ts.isExportSpecifier(parent) || forwardedByDefaultExport(node)) return null;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return null;
  if ('name' in parent && parent.name === node) return null;
  if (ts.isBindingElement(parent) && parent.propertyName === node) return null;
  if (inTypePosition(node)) return null;
  return checker.getSymbolAtLocation(node) ?? null;
}

// The symbols referenced as values: `named` from any identifier, `namespace` only as the object
// of `ns.<exportName>`.
function referencedSymbols(source, checker, exportName) {
  const named = new Set();
  const namespace = new Set();
  for (const node of nodesOf(source)) {
    if (!ts.isIdentifier(node)) continue;
    const symbol = valueSymbol(node, checker);
    if (!symbol) continue;
    named.add(symbol);
    const parent = node.parent;
    if (
      ts.isPropertyAccessExpression(parent) &&
      parent.expression === node &&
      parent.name.text === exportName
    )
      namespace.add(symbol);
  }
  return { named, namespace };
}

// The names a use's test must hold that it lacks: entry, use, the fields of its kind, and for
// consent a time field. The submission is checked by identity, not by name (r1 B8).
function missingNames(entry, use, text) {
  const names = [entry.id, use.useId];
  names.push(...REQUIRED_BY_KIND[entry.kind].map(key => entry[key]));
  const missing = names.filter(name => !text.includes(name));
  if (entry.kind === 'consent' && !TIME_RE.test(text)) missing.push('a time field');
  return missing;
}

// The test must bind the registered export through an import of the submission's module (resolved
// like the lint resolves it) and use that binding; a local stub, an unused import or an import of
// another export of the module does not count (r1 B8, r2 B5).
function submissionError(root, use, text) {
  const [module, exportName] = use.submission.split('#');
  const facts = bindingFacts(use.test, text, exportName);
  const resolver = resolverFor(root);
  const fromModule = entry => resolver.resolveFile(use.test, entry.spec) === module;
  if (!facts.imports.some(spec => fromModule({ spec })))
    return `does not import the submission module ${module}`;
  return facts.bindings.some(binding => binding.used && fromModule(binding))
    ? null
    : `does not use the submission export ${exportName} of ${module}`;
}

// The error of one use's test, or null when its evidence holds.
function useEvidenceError(root, lanes, entry, use) {
  const where = `consent registry ${entry.id}:${use.useId} test ${use.test}`;
  const text = readInside(root, use.test);
  if (text === null) return `${where} is missing`;
  if (!text.trim()) return `${where} is empty`;
  if (!inLane(lanes, use.test)) return `${where} is selected by no lane`;
  if (SKIPPED_RE.test(text)) return `${where} is skipped`;
  if (renamesTestFunction(use.test, text))
    return `${where} renames the test function it, test, describe or suite on import`;
  const submission = submissionError(root, use, text);
  if (submission) return `${where} ${submission}`;
  const missing = missingNames(entry, use, text);
  return missing.length ? `${where} does not name ${missing.join(', ')}` : null;
}

// Errors for each use's test (§2.1 "The test, per kind"): it exists, is in a lane, is not skipped,
// loads the registered submission and names the entry, the use and the fields of its kind.
export function testEvidence(root, registry, lanes) {
  const errors = [];
  for (const entry of [...registry.values()].sort((a, b) => byCodeUnit(a.id, b.id))) {
    if (entry.kind === 'not-consent') continue;
    for (const use of entry.uses) {
      const error = useEvidenceError(root, lanes, entry, use);
      if (error !== null) errors.push(error);
    }
  }
  return errors;
}
