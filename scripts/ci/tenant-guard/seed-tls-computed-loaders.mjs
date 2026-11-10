import ts from 'typescript';
import { loaderMember } from './seed-tls-global-loaders.mjs';

const REQUIRE = 1,
  FACTORY = 2,
  MODULE = 4,
  GLOBAL = 8;
const assignmentsByReferences = new WeakMap();
function assignments(references) {
  if (!assignmentsByReferences.has(references)) {
    const writes = new Map();
    for (const { node, binding } of references.values()) {
      const parent = node.parent;
      if (
        binding &&
        ts.isBinaryExpression(parent) &&
        parent.left === node &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
        if (!writes.has(binding)) writes.set(binding, []);
        writes.get(binding).push(parent.right);
      }
    }
    assignmentsByReferences.set(references, writes);
  }
  return assignmentsByReferences.get(references);
}

function unwrap(node) {
  while (
    node &&
    (ts.isAwaitExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression(node))
  )
    node = node.expression;
  return node;
}

function memberKind(base, member) {
  let kind = 0;
  if (base & REQUIRE && member === 'resolve') kind |= REQUIRE;
  if (base & MODULE && member === 'createRequire') kind |= FACTORY;
  if (base & (MODULE | GLOBAL) && member === 'require') kind |= REQUIRE;
  if (base & MODULE && ['default', 'Module'].includes(member)) kind |= MODULE;
  return kind;
}

function unboundKind(node) {
  if (node.text === 'require') return REQUIRE;
  if (node.text === 'module') return MODULE;
  return ['globalThis', 'global'].includes(node.text) ? GLOBAL : 0;
}

function identifierKind(node, references, seen) {
  const reference = references.get(node);
  if (!reference) return 0;
  const { binding } = reference;
  if (!binding) return unboundKind(node);
  if (binding.kind === 'import' && ['module', 'node:module'].includes(binding.specifier))
    return binding.imported === 'createRequire' ? FACTORY : MODULE;
  const declaration = binding.decl;
  if (!ts.isVariableDeclaration(declaration)) return 0;
  let base = loaderKind(declaration.initializer, references, new Set(seen));
  for (const value of assignments(references).get(binding) ?? [])
    base |= loaderKind(value, references, new Set(seen));
  if (ts.isObjectBindingPattern(declaration.name)) {
    const element = binding.id.parent;
    return memberKind(base, (element.propertyName ?? element.name).text);
  }
  return base;
}

function callKind(node, references, seen) {
  const kind = loaderKind(node.expression, references, seen);
  let result = kind & FACTORY ? REQUIRE : 0;
  if (
    (kind & REQUIRE || node.expression.kind === ts.SyntaxKind.ImportKeyword) &&
    node.arguments[0] &&
    ts.isStringLiteralLike(node.arguments[0]) &&
    ['module', 'node:module'].includes(node.arguments[0].text)
  )
    result |= MODULE;
  return result;
}

// Follow lexical aliases only; a local function named require is not a Node loader.
function loaderKind(node, references, seen = new Set()) {
  node = unwrap(node);
  if (!node || seen.has(node)) return 0;
  seen.add(node);
  if (ts.isIdentifier(node)) return identifierKind(node, references, seen);
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
    return memberKind(loaderKind(node.expression, references, seen), loaderMember(node));
  if (ts.isCallExpression(node)) return callKind(node, references, seen);
  if (ts.isConditionalExpression(node))
    return (
      loaderKind(node.whenTrue, references, new Set(seen)) |
      loaderKind(node.whenFalse, references, new Set(seen))
    );
  return 0;
}

export function computedSeedLoader(node, references) {
  if (!ts.isCallExpression(node)) return false;
  const loader =
    node.expression.kind === ts.SyntaxKind.ImportKeyword ||
    (loaderKind(node.expression, references) & REQUIRE) !== 0;
  return loader && (!node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0]));
}
