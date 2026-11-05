// Tenant guard stage helper (L): the syntactic forms the transaction-lifetime analysis admits.

import ts from 'typescript';
import { hasFlag } from './rules-digest.mjs';
import { isFunctionLike } from './syntax.mjs';

/** The reviewed Drizzle members a borrowed capability may be called through. */
export const LIFETIME_MEMBERS = new Set([
  '$count',
  'delete',
  'execute',
  'insert',
  'query',
  'select',
  'selectDistinct',
  'selectDistinctOn',
  'transaction',
  'update',
  'with',
]);
const REBINDING = new Set(['apply', 'bind', 'call']);
// Strict comparisons only: a loose one converts an object operand through its own methods.
const COMPARISONS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);
/** Members the language invokes implicitly (conversions, thenables, serialization). */
export const IMPLICIT_MEMBERS = new Set([
  'constructor',
  'then',
  'toJSON',
  'toLocaleString',
  'toString',
  'valueOf',
]);
export const kindOf = node => ts.SyntaxKind[node.kind];

/** The nearest enclosing function of `node`. */
export function ownerOf(node) {
  for (let current = node.parent; current; current = current.parent)
    if (isFunctionLike(current)) return current;
  return null;
}

/** Why `fn` cannot hold a borrowed capability at all, or null. */
export function shapeProblem(fact, fn, referenceAt) {
  if (!fn.body) return 'a function without a body';
  if (fn.asteriskToken) return 'a generator (its iterator retains its parameters)';
  if (!ts.isFunctionDeclaration(fn) && !ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn))
    return `a method, accessor or constructor (${kindOf(fn)})`;
  if (fn.parameters.some(param => ts.isIdentifier(param.name) && param.name.text === 'this'))
    return 'an explicit this parameter';
  let found = null;
  const visit = node => {
    if (found) return;
    if (ts.isIdentifier(node) && !referenceAt(fact, node)?.binding) {
      if (node.text === 'eval' || node.text === 'Function') found = 'an eval-like global';
      if (node.text === 'arguments' && nonArrowOwner(node) === fn) found = 'implicit arguments';
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn, visit);
  return found;
}
function nonArrowOwner(node) {
  let owner = ownerOf(node);
  while (owner && ts.isArrowFunction(owner)) owner = ownerOf(owner);
  return owner;
}

/** Whether a reference is written: an assignment, update or delete target, a destructuring
 * assignment target, or the iteration target of `for…of` / `for…in`. */
export function writes(node, { isWriteTarget, outermost }) {
  const value = outermost(node);
  if (isWriteTarget(value)) return true;
  let current = value;
  for (let parent = current.parent; parent; parent = current.parent) {
    const container =
      ts.isArrayLiteralExpression(parent) ||
      ts.isSpreadElement(parent) ||
      ts.isShorthandPropertyAssignment(parent) ||
      (ts.isPropertyAssignment(parent) && parent.initializer === current) ||
      ts.isObjectLiteralExpression(parent) ||
      ts.isParenthesizedExpression(parent);
    if (!container) break;
    current = parent;
  }
  const loop = current.parent;
  return (ts.isForOfStatement(loop) || ts.isForInStatement(loop)) && loop.initializer === current;
}

/** How many `var` and function declarations of `name` hoist into the function or file `scope`
 * (nested functions excluded): such a declaration rebinds a parameter or a declared function. */
export function hoistedDeclarations(scope, name) {
  let count = 0;
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) count += 1;
    if (node !== scope && isFunctionLike(node)) return;
    if (ts.isVariableDeclarationList(node) && !(node.flags & ts.NodeFlags.BlockScoped)) {
      for (const declaration of node.declarations)
        if (bindsName(declaration.name, name)) count += 1;
    }
    ts.forEachChild(node, visit);
  };
  if (ts.isSourceFile(scope)) ts.forEachChild(scope, visit);
  else if (scope.body) ts.forEachChild(scope.body, visit);
  return count;
}
function bindsName(pattern, name) {
  if (ts.isIdentifier(pattern)) return pattern.text === name;
  return pattern.elements.some(
    element => !ts.isOmittedExpression(element) && bindsName(element.name, name)
  );
}

/** `access` reads a capability member: a reviewed member chain that ends in a call, or a test. */
export function memberProblem(access, outermost) {
  if (!LIFETIME_MEMBERS.has(access.name.text))
    return `an unreviewed capability member (${access.name.text})`;
  // Optional links only short-circuit to undefined; the chain must still end in a call.
  for (let chain = access; ;) {
    if (REBINDING.has(chain.name.text)) return `a rebound capability member (${chain.name.text})`;
    const outer = outermost(chain);
    const parent = outer.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === outer) chain = parent;
    else if (ts.isCallExpression(parent) && parent.expression === outer) return null;
    else if (ts.isTypeOfExpression(parent)) return null;
    else return `a capability member used as a value (${access.name.text})`;
  }
}

/** A test of the value that yields no reference to it: `!v`, `typeof v`, comparisons, `v ?`,
 * `if (v)` and the left side of `&&` (which yields the value only when it is falsy). */
export function tested(value, parent) {
  if (ts.isTypeOfExpression(parent)) return true;
  if (ts.isPrefixUnaryExpression(parent)) return parent.operator === ts.SyntaxKind.ExclamationToken;
  if (ts.isConditionalExpression(parent)) return parent.condition === value;
  if (ts.isIfStatement(parent) || ts.isWhileStatement(parent)) return parent.expression === value;
  if (!ts.isBinaryExpression(parent)) return false;
  const operator = parent.operatorToken.kind;
  if (operator === ts.SyntaxKind.AmpersandAmpersandToken) return parent.left === value;
  return COMPARISONS.has(operator);
}

export const constInitializer = (parent, value) =>
  ts.isVariableDeclaration(parent) &&
  parent.initializer === value &&
  hasFlag(parent.parent, ts.NodeFlags.Const);

/** Whether the call's completion is joined: awaited, or returned to the caller. */
export function joined(call, outermost) {
  const value = outermost(call);
  const parent = value.parent;
  if (ts.isAwaitExpression(parent)) return true;
  if (ts.isArrowFunction(parent)) return parent.body === value;
  return ts.isReturnStatement(parent) && !finallyMayOverride(parent);
}

/** Whether a `finally` around the return could complete abruptly and discard its promise. */
function finallyMayOverride(statement) {
  for (let node = statement; node && !isFunctionLike(node); node = node.parent) {
    const parent = node.parent;
    if (ts.isTryStatement(parent) && parent.finallyBlock && node !== parent.finallyBlock)
      return true;
  }
  return false;
}

export const isAsync = fn =>
  (fn.modifiers ?? []).some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword);

/** Whether `node` only reads a member of a carrier other than the borrowed `path` head. */
export function otherMember(node, path) {
  const parent = node.parent;
  return (
    path.length > 0 &&
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === node &&
    parent.name.text !== path[0]
  );
}
