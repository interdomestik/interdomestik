import ts from 'typescript';
import { isFunction, unwrap } from './db-access-source.mjs';
import { trustedSchemaColumn } from './db-access-external.mjs';
import { ownReturns } from './db-access-invocation-shapes.mjs';

const UNKNOWN = 'unknown';
// Every public root call gets a fresh budget object; its recursive helpers share that object.
const HANDLE_BUDGET = 2048;
const newHandleBudget = () => ({ remaining: HANDLE_BUDGET });
const UNION_OPERATORS = [
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.EqualsToken,
];
// A known handle wins over UNKNOWN, which wins over false. Callers evaluate every branch first.
function union(values) {
  if (values.includes(true)) return true;
  return values.includes(UNKNOWN) ? UNKNOWN : false;
}
function enter(node, context, seen) {
  const contexts = seen.get(node) ?? new Set();
  // Count actual node/context visits, not only AST nodes. Recursive return calls create
  // fresh frames for the same node; they must exhaust the existing bound before native stack.
  let visits = 0;
  for (const entries of seen.values()) visits += entries.size;
  if (contexts.has(context) || visits >= 64) return;
  const next = new Map(seen);
  next.set(node, new Set(contexts).add(context));
  return next;
}
export function createContextualProvenance(model, legacy, dispatch) {
  function binding(parameter, context) {
    return context && dispatch.bindingsFor(context)?.find(item => item.parameter === parameter);
  }
  function value(raw, context, seen = new Map()) {
    if (dispatch.isBuilding()) return legacy.provenance(raw);
    const node = unwrap(raw);
    if (!node || legacy.isMutated(node)) return UNKNOWN;
    seen = enter(node, context, seen);
    if (!seen) return UNKNOWN;
    const decl = model.declaration(node);
    if (
      decl &&
      model.fileOf(decl) === 'packages/database/src/db.ts' &&
      ['db', 'dbRls', 'dbAdmin'].includes(decl.name?.text)
    )
      return decl.name.text;
    const bound = decl && ts.isParameter(decl) && binding(decl, context);
    if (bound) return value(bound.argument, bound.callerContext, seen);
    if (decl && ts.isVariableDeclaration(decl) && decl.initializer)
      return value(decl.initializer, context, seen);
    if (ts.isPropertyAccessExpression(node)) {
      const object = unwrap(node.expression);
      const parameter = model.declaration(object);
      const actual = parameter && ts.isParameter(parameter) && binding(parameter, context);
      if (actual) return property(actual.argument, node.name.text, actual.callerContext, seen);
    }
    return legacy.provenance(node);
  }
  function objectLiteralProperty(node, key, context, seen) {
    if (
      node.properties.some(
        item =>
          ts.isSpreadAssignment(item) ||
          ts.isGetAccessorDeclaration(item) ||
          ts.isSetAccessorDeclaration(item)
      )
    )
      return UNKNOWN;
    const item = node.properties.find(
      entry => entry.name?.getText().replace(/^['"]|['"]$/gu, '') === key
    );
    if (item && ts.isPropertyAssignment(item)) return value(item.initializer, context, seen);
    if (item && ts.isShorthandPropertyAssignment(item)) return value(item.name, context, seen);
    return UNKNOWN;
  }
  function property(raw, key, context, seen) {
    const node = unwrap(raw);
    if (!node || legacy.isMutated(node)) return UNKNOWN;
    seen = enter(node, context, seen);
    if (!seen) return UNKNOWN;
    if (ts.isObjectLiteralExpression(node)) return objectLiteralProperty(node, key, context, seen);
    const decl = model.declaration(node);
    if (decl && ts.isVariableDeclaration(decl) && decl.initializer)
      return property(decl.initializer, key, context, seen);
    const bound = decl && ts.isParameter(decl) && binding(decl, context);
    return bound ? property(bound.argument, key, bound.callerContext, seen) : UNKNOWN;
  }
  // Revisiting immutable object/function identity is not executing a recursive body.
  function revisited(node) {
    const decl = model.declaration(node);
    const initializer = decl && ts.isVariableDeclaration(decl) && unwrap(decl.initializer);
    if (
      isFunction(node) ||
      ts.isObjectLiteralExpression(node) ||
      (initializer &&
        (decl.parent.flags & ts.NodeFlags.Const) !== 0 &&
        (isFunction(initializer) || ts.isObjectLiteralExpression(initializer)))
    )
      return false;
    return UNKNOWN;
  }
  // Captured identifier handles in model.walk order. Property names, declaration names, type
  // positions and bindings declared inside fn are not captures.
  function captureHandles(fn, context, seen, budget) {
    const captures = [];
    model.walk(fn.body, part => {
      if (!ts.isIdentifier(part)) return;
      const parent = part.parent;
      if (
        (ts.isPropertyAccessExpression(parent) && parent.name === part) ||
        (parent.name === part && !ts.isShorthandPropertyAssignment(parent))
      )
        return;
      for (let scope = parent; scope && scope !== fn; scope = scope.parent)
        if (ts.isTypeNode(scope)) return;
      const declaration = model.declaration(part);
      for (let scope = declaration; scope; scope = scope.parent) if (scope === fn) return;
      captures.push(handle(part, context, seen, budget));
    });
    return captures;
  }
  // Open-frame parameter: the legacy answer, stale state, then every actual caller in order.
  // undefined means not applicable, so the ordered dispatcher continues.
  function parameterCallerHandle(decl, node, context, stale, seen, budget) {
    if (!decl || !ts.isParameter(decl) || context) return undefined;
    const callers = dispatch.callsFor(decl.parent);
    if (!callers.length) return undefined;
    return union([
      legacy.tenantHandle(node),
      stale,
      ...callers.map(item => {
        const actual = binding(decl, item.context);
        return actual ? handle(actual.argument, actual.callerContext, seen, budget) : UNKNOWN;
      }),
    ]);
  }
  // Bound parameter, caller union, function captures, variable initializer. undefined means
  // unhandled; false is a handled no-handle answer and is returned.
  function declarationHandle(node, decl, context, stale, seen, budget) {
    const bound = decl && ts.isParameter(decl) && binding(decl, context);
    if (bound) return union([handle(bound.argument, bound.callerContext, seen, budget), stale]);
    const callers = parameterCallerHandle(decl, node, context, stale, seen, budget);
    if (callers !== undefined) return callers;
    if (isFunction(node) || (decl && isFunction(decl))) {
      const fn = isFunction(node) ? node : decl;
      return union([...captureHandles(fn, context, seen, budget), stale]);
    }
    if (decl && ts.isVariableDeclaration(decl) && decl.initializer)
      return union([handle(decl.initializer, context, seen, budget), stale]);
    return undefined;
  }
  function propertyHandle(item, context, seen, budget) {
    if (ts.isPropertyAssignment(item)) return handle(item.initializer, context, seen, budget);
    if (ts.isShorthandPropertyAssignment(item)) return handle(item.name, context, seen, budget);
    if (ts.isSpreadAssignment(item)) return handle(item.expression, context, seen, budget);
    if (isFunction(item)) return handle(item, context, seen, budget);
    return UNKNOWN;
  }
  // undefined for an operator that is neither comma nor a union operator.
  function binaryHandle(node, context, seen, budget) {
    if (node.operatorToken.kind === ts.SyntaxKind.CommaToken)
      return handle(node.right, context, seen, budget);
    if (UNION_OPERATORS.includes(node.operatorToken.kind))
      return union([
        handle(node.left, context, seen, budget),
        handle(node.right, context, seen, budget),
      ]);
    return undefined;
  }
  // await/spread, member, conditional, binary, object and array composites in their original
  // order. undefined means unhandled; every branch is evaluated before union.
  function compositeHandle(node, context, stale, seen, budget) {
    if (ts.isAwaitExpression(node) || ts.isSpreadElement(node))
      return handle(node.expression, context, seen, budget);
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
      return union([handle(node.expression, context, seen, budget), stale]);
    if (ts.isConditionalExpression(node))
      return union([
        handle(node.whenTrue, context, seen, budget),
        handle(node.whenFalse, context, seen, budget),
      ]);
    if (ts.isBinaryExpression(node)) return binaryHandle(node, context, seen, budget);
    if (ts.isObjectLiteralExpression(node))
      return union(node.properties.map(item => propertyHandle(item, context, seen, budget)));
    if (ts.isArrayLiteralExpression(node))
      return union(node.elements.map(item => handle(item, context, seen, budget)));
    return undefined;
  }
  // A bare `return;` has no expression and evaluates to false through handle(undefined).
  function targetReturnHandles(target, seen, budget) {
    const body = target.functionNode.body;
    return ts.isBlock(body)
      ? ownReturns(body).map(item => handle(item.expression, target.context, seen, budget))
      : [handle(body, target.context, seen, budget)];
  }
  // Results of every actual dispatch target in order, or undefined for a non-call/boundary.
  function callTargetHandles(node, context, seen, budget) {
    if (
      !ts.isCallExpression(node) ||
      legacy.canonical(node.expression) ||
      legacy.queryBoundary?.(node.expression)
    )
      return undefined;
    const results = [];
    for (const alternative of dispatch.variants(node, context))
      for (const target of alternative.targets)
        results.push(...targetReturnHandles(target, seen, budget));
    return results;
  }
  // Ordered dispatcher: budget, revisit, enter, tenant value, trusted schema column, stale,
  // declaration forms, composites, call targets, legacy fallback.
  function handle(raw, context, seen = new Map(), budget = newHandleBudget()) {
    if (dispatch.isBuilding()) return legacy.tenantHandle(raw);
    const node = unwrap(raw);
    if (!node) return false;
    if (--budget.remaining < 0) return UNKNOWN;
    if (seen.get(node)?.has(context)) return revisited(node);
    seen = enter(node, context, seen);
    if (!seen) return UNKNOWN;
    if (value(node, context) === 'tenant-context') return true;
    if (trustedSchemaColumn(model, facade(context), node)) return false;
    const stale = legacy.isMutated(node) ? UNKNOWN : false;
    const declared = declarationHandle(node, model.declaration(node), context, stale, seen, budget);
    if (declared !== undefined) return declared;
    const composite = compositeHandle(node, context, stale, seen, budget);
    if (composite !== undefined) return composite;
    const called = callTargetHandles(node, context, seen, budget);
    if (called?.length) return union([...called, stale]);
    return union([legacy.tenantHandle(node), stale]);
  }
  function facade(context) {
    return {
      ...legacy,
      dispatch,
      context,
      forContext: facade,
      provenance: raw => value(raw, context),
      tenantHandle: raw => handle(raw, context),
    };
  }
  return { value, handle, facade };
}
