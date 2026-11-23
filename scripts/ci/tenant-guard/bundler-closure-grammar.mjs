// The closed loader grammar of a bundler closure file (see bundler-closure.mjs).
//
// Code reaches other code only through top-level static imports with literal specifiers. Every
// other way to load, resolve or evaluate code refuses: CommonJS loaders, dynamic import,
// import.meta, eval and the Function constructor, global objects through which `process` could be
// reached, and any use of `process` other than reading `process.env`.
// Reviewed-bytes limit: a key computed through a variable from concatenated pieces remains
// visible in the bound bytes and requires review.

import { builtinModules } from 'node:module';
import ts from 'typescript';

// Node 24.15.0 builtins, recorded so a runner with fewer builtins cannot narrow the refusal; the
// runtime list is added on top. A `node:` specifier is refused whatever its name.
const RECORDED_BUILTINS = (
  'assert assert/strict async_hooks buffer child_process cluster console constants crypto dgram ' +
  'diagnostics_channel dns dns/promises domain events fs fs/promises http http2 https inspector ' +
  'inspector/promises module net os path path/posix path/win32 perf_hooks process punycode ' +
  'querystring readline readline/promises repl sea sqlite stream stream/consumers stream/promises ' +
  'stream/web string_decoder sys test timers timers/promises tls trace_events tty url util ' +
  'util/types v8 vm wasi worker_threads zlib'
).split(' ');
export const NODE_BUILTINS = new Set(
  [...RECORDED_BUILTINS, ...builtinModules].map(name => name.replace(/^node:/u, ''))
);

const REFUSED_REFERENCES = new Set([
  'require',
  'module',
  'exports',
  'createRequire',
  '__non_webpack_require__',
  '__webpack_require__',
  'eval',
  'Function',
  'globalThis',
  'global',
  'self',
  'window',
]);
const REFUSED_MEMBERS = new Set([
  'require',
  'createRequire',
  'getBuiltinModule',
  'dlopen',
  'binding',
  '_linkedBinding',
  'mainModule',
  'constructor',
  '__proto__',
]);

// A name in property position is not a reference to a binding.
function isPropertyName(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent)) return parent.name === node;
  return (
    (ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent)) &&
    parent.name === node
  );
}

function computedNameProblem(key, readsProperty) {
  while (ts.isParenthesizedExpression(key)) key = key.expression;
  if (
    readsProperty &&
    (ts.isTemplateExpression(key) ||
      (ts.isBinaryExpression(key) && key.operatorToken.kind === ts.SyntaxKind.PlusToken))
  )
    return 'computed loader key';
  return ts.isStringLiteralLike(key) && REFUSED_MEMBERS.has(key.text)
    ? `loader member ${key.text}`
    : null;
}

function isPlainElementAssignment(node) {
  while (ts.isParenthesizedExpression(node.parent)) node = node.parent;
  const { parent } = node;
  return (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    parent.left === node &&
    // A destructuring default also uses an equals token.
    !ts.isAssignmentTarget(parent)
  );
}

function memberProblem(node) {
  if (ts.isElementAccessExpression(node))
    return computedNameProblem(node.argumentExpression, !isPlainElementAssignment(node));
  if (ts.isComputedPropertyName(node)) return computedNameProblem(node.expression, false);
  let name;
  if (ts.isPropertyAccessExpression(node)) name = node.name;
  else if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent))
    name = node.propertyName ?? node.name;
  else if (
    (ts.isShorthandPropertyAssignment(node) || ts.isPropertyAssignment(node)) &&
    ts.isAssignmentTarget(node.parent)
  )
    name = node.name;
  if (!name) return null;
  if (ts.isComputedPropertyName(name)) return computedNameProblem(name.expression, true);
  if ((ts.isIdentifier(name) || ts.isStringLiteralLike(name)) && REFUSED_MEMBERS.has(name.text))
    return `loader member ${name.text}`;
  return null;
}

function loadStatementProblem(node, source) {
  if (node.parent !== source) return 'nested module statement';
  if (node.attributes || node.assertClause) return 'import attributes';
  if (node.moduleSpecifier && !ts.isStringLiteral(node.moduleSpecifier))
    return 'non-literal specifier';
  return null;
}

function nodeProblem(node, source) {
  if (ts.isImportEqualsDeclaration(node)) return 'import-equals declaration';
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
    return loadStatementProblem(node, source);
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
    return 'dynamic import';
  if (ts.isMetaProperty(node)) return 'meta property';
  const member = memberProblem(node);
  if (member) return member;
  if (ts.isStringLiteralLike(node)) return stringProblem(node);
  return identifierProblem(node);
}

// Refused names are deliberately rejected in string literals, even as inert data.
function stringProblem(node) {
  if (REFUSED_REFERENCES.has(node.text)) {
    if (node.parent.moduleSpecifier === node && NODE_BUILTINS.has(node.text))
      return `builtin ${node.text}`;
    return `loader reference ${node.text}`;
  }
  return REFUSED_MEMBERS.has(node.text) ? `loader member ${node.text}` : null;
}

function identifierProblem(node) {
  if (!ts.isIdentifier(node) || isPropertyName(node)) return null;
  if (REFUSED_REFERENCES.has(node.text)) return `loader reference ${node.text}`;
  if (node.text !== 'process') return null;
  const parent = node.parent;
  return ts.isPropertyAccessExpression(parent) &&
    parent.expression === node &&
    parent.name.text === 'env'
    ? null
    : 'process use other than process.env';
}

/** The first construct outside the closed grammar, or null. */
export function bundlerGrammarProblem(source) {
  let problem = null;
  const visit = node => {
    problem ??= nodeProblem(node, source);
    if (!problem) ts.forEachChild(node, visit);
  };
  visit(source);
  return problem;
}
