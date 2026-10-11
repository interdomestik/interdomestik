import ts from 'typescript';
import { isFunction, unwrap } from './db-access-source.mjs';
import { trustedSchemaColumn } from './db-access-external.mjs';
import { ownReturns } from './db-access-invocation-shapes.mjs';

const UNKNOWN = 'unknown';
const union = values => (values.includes(true) ? true : values.includes(UNKNOWN) ? UNKNOWN : false);
export function createContextualProvenance(model, legacy, dispatch) {
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
  function property(raw, key, context, seen) {
    const node = unwrap(raw);
    if (!node || legacy.isMutated(node)) return UNKNOWN;
    seen = enter(node, context, seen);
    if (!seen) return UNKNOWN;
    if (ts.isObjectLiteralExpression(node)) {
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
        item => item.name?.getText().replace(/^['"]|['"]$/gu, '') === key
      );
      return item && ts.isPropertyAssignment(item)
        ? value(item.initializer, context, seen)
        : item && ts.isShorthandPropertyAssignment(item)
          ? value(item.name, context, seen)
          : UNKNOWN;
    }
    const decl = model.declaration(node);
    if (decl && ts.isVariableDeclaration(decl) && decl.initializer)
      return property(decl.initializer, key, context, seen);
    const bound = decl && ts.isParameter(decl) && binding(decl, context);
    return bound ? property(bound.argument, key, bound.callerContext, seen) : UNKNOWN;
  }
  function handle(raw, context, seen = new Map(), budget = { remaining: 2048 }) {
    if (dispatch.isBuilding()) return legacy.tenantHandle(raw);
    const node = unwrap(raw);
    if (!node) return false;
    if (--budget.remaining < 0) return UNKNOWN;
    if (seen.get(node)?.has(context)) {
      const decl = model.declaration(node);
      const initializer = decl && ts.isVariableDeclaration(decl) && unwrap(decl.initializer);
      // Revisiting immutable object/function identity is not executing a recursive body.
      if (
        isFunction(node) ||
        ts.isObjectLiteralExpression(node) ||
        (initializer &&
          decl.parent.flags & ts.NodeFlags.Const &&
          (isFunction(initializer) || ts.isObjectLiteralExpression(initializer)))
      )
        return false;
      return UNKNOWN;
    }
    seen = enter(node, context, seen);
    if (!seen) return UNKNOWN;
    if (value(node, context) === 'tenant-context') return true;
    if (trustedSchemaColumn(model, facade(context), node)) return false;
    const stale = legacy.isMutated(node) ? UNKNOWN : false;
    const decl = model.declaration(node);
    const bound = decl && ts.isParameter(decl) && binding(decl, context);
    if (bound) return union([handle(bound.argument, bound.callerContext, seen, budget), stale]);
    if (decl && ts.isParameter(decl) && !context) {
      const callers = dispatch.callsFor(decl.parent);
      if (callers.length)
        return union([
          legacy.tenantHandle(node),
          stale,
          ...callers.map(item => {
            const actual = binding(decl, item.context);
            return actual ? handle(actual.argument, actual.callerContext, seen, budget) : UNKNOWN;
          }),
        ]);
    }
    if (isFunction(node) || (decl && isFunction(decl))) {
      const fn = isFunction(node) ? node : decl;
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
      return union([...captures, stale]);
    }
    if (decl && ts.isVariableDeclaration(decl) && decl.initializer)
      return union([handle(decl.initializer, context, seen, budget), stale]);
    if (ts.isAwaitExpression(node) || ts.isSpreadElement(node))
      return handle(node.expression, context, seen, budget);
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
      return union([handle(node.expression, context, seen, budget), stale]);
    if (ts.isConditionalExpression(node))
      return union([
        handle(node.whenTrue, context, seen, budget),
        handle(node.whenFalse, context, seen, budget),
      ]);
    if (ts.isBinaryExpression(node)) {
      if (node.operatorToken.kind === ts.SyntaxKind.CommaToken)
        return handle(node.right, context, seen, budget);
      if (
        [
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.QuestionQuestionToken,
          ts.SyntaxKind.EqualsToken,
        ].includes(node.operatorToken.kind)
      )
        return union([
          handle(node.left, context, seen, budget),
          handle(node.right, context, seen, budget),
        ]);
    }
    if (ts.isObjectLiteralExpression(node))
      return union(
        node.properties.map(item => {
          if (ts.isPropertyAssignment(item)) return handle(item.initializer, context, seen, budget);
          if (ts.isShorthandPropertyAssignment(item))
            return handle(item.name, context, seen, budget);
          if (ts.isSpreadAssignment(item)) return handle(item.expression, context, seen, budget);
          if (isFunction(item)) return handle(item, context, seen, budget);
          return UNKNOWN;
        })
      );
    if (ts.isArrayLiteralExpression(node))
      return union(node.elements.map(item => handle(item, context, seen, budget)));
    if (
      ts.isCallExpression(node) &&
      !legacy.canonical(node.expression) &&
      !legacy.queryBoundary?.(node.expression)
    ) {
      const results = [];
      for (const alternative of dispatch.variants(node, context))
        for (const target of alternative.targets) {
          const body = target.functionNode.body;
          results.push(
            ...(ts.isBlock(body)
              ? ownReturns(body).map(item => handle(item.expression, target.context, seen, budget))
              : [handle(body, target.context, seen, budget)])
          );
        }
      if (results.length) return union([...results, stale]);
    }
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
