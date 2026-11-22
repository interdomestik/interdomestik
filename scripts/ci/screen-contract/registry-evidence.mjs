import ts from 'typescript';

import { byCodeUnit } from '../server-mutation/ast.mjs';
import { readInside } from './paths.mjs';
import { inLane } from './registry-lanes.mjs';
import { REQUIRED_BY_KIND } from './registry-parse.mjs';
import { resolverFor } from './specifiers.mjs';

const SKIPPED_RE =
  /\b(?:it|test|describe|suite)\s*\.\s*(?:skip|todo|fixme)\b|\bx(?:it|describe)\s*\(/u;
const TEST_FUNCTIONS = new Set(['it', 'test', 'describe', 'suite']);
const TEST_RUNNERS = new Set(['vitest', '@playwright/test']);

// Whether a module can export a test function: a runner, or a repository-local module (relative or
// `@/`), which can re-export one as the Playwright fixtures do (r9 B1). Another bare package is
// exempt (`date-fns/locale`'s `it`, r8 B2).
const mayExportTestFunction = spec =>
  TEST_RUNNERS.has(spec) || spec.startsWith('.') || spec.startsWith('@/');

// Whether a test imports a test function under another name as a value
// (`import { suite as s } from 'vitest'`, `import { test as t } from '../fixtures/auth.fixture'`): a
// skip through that name is not seen, so such a test is no evidence at all (fail closed, r7 B3). A
// type-only import is no test function (r8 B2).
function renamesTestFunction(rel, text) {
  const kind = /\.[jt]sx$/u.test(rel) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
  return source.statements.some(
    statement =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      mayExportTestFunction(statement.moduleSpecifier.text) &&
      !statement.importClause?.isTypeOnly &&
      statement.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some(
        element =>
          !element.isTypeOnly &&
          element.propertyName !== undefined &&
          TEST_FUNCTIONS.has(element.propertyName.text) &&
          element.propertyName.text !== element.name.text
      )
  );
}
// A time-field name ends in one of these (`createdAt`, `granted_at`, `timestamp`); the regex only
// tests for one, so the leading word characters need no match of their own.
const TIME_RE = /(?:At|_at|Time|time|timestamp)\b/u;

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
