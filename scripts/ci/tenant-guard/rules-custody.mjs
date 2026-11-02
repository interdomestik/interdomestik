// Tenant guard stage: custody of values that hold reviewed schema state (A5-r2 Q5).
//
// An imported operator does not detach what it is given: Drizzle `eq(claims.id, x)` keeps the
// column object itself in the returned SQL (`queryChunks`), so the result is an alias of schema
// state. In changed code it may only be bound, collected, composed, passed to workspace functions
// (the parameter is held), returned from declared functions and consumed by a query builder;
// anything else is refused. Custody is finite: held whole, at one static object key (`{ where }`)
// or as a Drizzle table alias (each member is a held column); deeper or unknown keys are whole.

import ts from 'typescript';
import { unitOf } from './syntax.mjs';

// Members of a held value that return the same SQL (or an alias wrapper of it): still held.
const SQL_METHODS = new Set(['as', 'mapWith']);
// Relational query methods that take their conditions in an options object.
const RELATIONAL_METHODS = new Set(['findFirst', 'findMany']);
// Methods of a local collecting array that only add to it (their results carry no element).
const COLLECTORS = new Set(['push', 'unshift']);
// Drizzle operators whose result is a table alias: every member is a column of the table.
const TABLE_ALIASES = new Set(['alias', 'aliasedTable']);
const TABLE = Symbol('table');
const UNKNOWN = Symbol('unknown key'); // a computed key that is not a literal: it may be any key

/** Installs the held-value (custody) analysis on `ctx`. */
export function installCustody(ctx) {
  const { BUILDER_METHODS, outermost, unwrap, yieldsOperand } = ctx;
  // The one property-key policy, for every carrier: a name or a literal computed key.
  const staticKey = name => {
    const literal = ts.isComputedPropertyName(name) ? unwrap(name.expression) : name;
    if (ts.isStringLiteralLike(literal) || ts.isNumericLiteral(literal)) return literal.text;
    return ts.isIdentifier(literal) && literal === name ? name.text : UNKNOWN;
  };

  const text = (fact, node) => node.getText(fact.sourceFile).slice(0, 60);
  const isWrite = node => {
    const parent = outermost(node).parent;
    return (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      parent.left === outermost(node)
    );
  };
  // Reads of `name` declared by `decl` (a variable declaration, or a function for its parameters).
  const readsOf = (fact, decl, name) =>
    fact.references.filter(
      reference =>
        reference.binding?.decl === decl && reference.node.text === name && !isWrite(reference.node)
    );
  const visit = (seen, node, key) => {
    const keys = (seen.visited ??= new Map()).get(node) ?? new Set();
    if (keys.has(key)) return false;
    seen.visited.set(node, keys.add(key));
    return true;
  };
  const isTableAlias = (fact, callee) => {
    const name = unwrap(callee);
    const binding = ts.isIdentifier(name) ? ctx.referenceAt(fact, name)?.binding : null;
    return (
      binding?.kind === 'import' &&
      /^drizzle-orm(?:\/|$)/u.test(binding.specifier ?? '') &&
      TABLE_ALIASES.has(binding.imported)
    );
  };

  /** Why a held value may not go where it goes, or null. `key` is its custody (see above). */
  function heldResultProblem(fact, unit, held, seen = {}, key = null) {
    if (!visit(seen, held, key)) return null;
    const value = outermost(held);
    const parent = value.parent;
    const next = (node, custody = key) => heldResultProblem(fact, unit, node, seen, custody);
    if (
      (ts.isConditionalExpression(parent) && parent.condition !== value) ||
      (ts.isBinaryExpression(parent) && yieldsOperand(parent, value)) ||
      ts.isAwaitExpression(parent)
    ) {
      return next(parent);
    }
    if (
      ts.isExpressionStatement(parent) || // discarded
      ts.isPrefixUnaryExpression(parent) ||
      (ts.isConditionalExpression(parent) && parent.condition === value) ||
      ((ts.isIfStatement(parent) || ts.isWhileStatement(parent)) && parent.expression === value)
    ) {
      return null;
    }
    if (ts.isCallExpression(parent) && parent.arguments.includes(value)) {
      return consumerProblem(fact, unit, parent, value, seen, key);
    }
    if (ts.isSpreadElement(parent) && ts.isCallExpression(parent.parent)) {
      return consumerProblem(fact, unit, parent.parent, parent, seen, key);
    }
    // Composed into a literal that is not (yet) an argument.
    if (ts.isArrayLiteralExpression(parent)) return next(parent, null);
    if (ts.isSpreadElement(parent) && ts.isArrayLiteralExpression(parent.parent)) {
      return next(parent.parent, null);
    }
    if (ts.isSpreadAssignment(parent)) return next(parent.parent, key === null ? null : key);
    if (
      ts.isShorthandPropertyAssignment(parent) ||
      (ts.isPropertyAssignment(parent) && parent.initializer === value)
    ) {
      // `{ __proto__: held }` makes it the prototype: refused in every spelling.
      const name = staticKey(parent.name);
      if (name === '__proto__') return `sets an object prototype (${text(fact, parent)})`;
      return next(parent.parent, key === null && name !== UNKNOWN ? name : null);
    }
    if (ts.isPropertyAccessExpression(parent) && parent.expression === value) {
      return memberProblem(fact, parent, next, key);
    }
    if (ts.isVariableDeclaration(parent) && parent.initializer === value) {
      return ts.isObjectBindingPattern(parent.name) && typeof key === 'string'
        ? patternProblem(fact, parent.name, parent, key, seen)
        : bindingProblem(fact, unit, parent, seen, key);
    }
    if (ts.isBinaryExpression(parent) && parent.right === value && isWrite(parent.left)) {
      const target = unwrap(parent.left);
      const declaration = ts.isIdentifier(target)
        ? ctx.referenceAt(fact, target)?.binding?.decl
        : null;
      if (declaration && ts.isVariableDeclaration(declaration)) {
        return bindingProblem(fact, unit, declaration, seen, key);
      }
    }
    if (ts.isReturnStatement(parent) || (ts.isArrowFunction(parent) && parent.body === value)) {
      return returnProblem(fact, value, seen, key);
    }
    return `escapes (${text(fact, parent)})`;
  }

  /** A member of a held value: a column of a table alias, the held key, or a free member. */
  function memberProblem(fact, access, next, key) {
    const member = access.name.text;
    const use = outermost(access).parent;
    const called = ts.isCallExpression(use) && use.expression === outermost(access);
    if (key === TABLE || member === key) return next(access, null);
    if (key !== null) return called ? `is called through (${text(fact, access)})` : null;
    if (SQL_METHODS.has(member) && called) return next(use);
    if (COLLECTORS.has(member) && called) return null;
    if (member === 'splice' && called && ts.isExpressionStatement(outermost(use).parent)) {
      return null;
    }
    if (member === 'length' && !called) return null;
    return `is read through (${text(fact, access)})`;
  }

  /** Every read of a local binding that holds a value is held in turn. */
  function bindingProblem(fact, unit, declaration, seen, key) {
    if (!ts.isIdentifier(declaration.name)) return `is destructured (${text(fact, declaration)})`;
    if (declaration.parent.parent?.parent === fact.sourceFile) return 'is stored at module scope';
    if (!visit(seen, declaration, key)) return null;
    for (const use of readsOf(fact, declaration, declaration.name.text)) {
      const problem = heldResultProblem(fact, unit, use.node, seen, key);
      if (problem) return `is held by ${declaration.name.text}, which ${problem}`;
    }
    return null;
  }

  /** `{ [key]: name, ...rest }` taken from an object that holds a value at `key`. */
  function patternProblem(fact, pattern, decl, key, seen) {
    for (const element of pattern.elements) {
      const name = element.dotDotDotToken ? key : staticKey(element.propertyName ?? element.name);
      if (name === UNKNOWN) return `is destructured by a computed key (${text(fact, element)})`;
      if (name !== key) continue;
      if (!ts.isIdentifier(element.name)) return `is destructured (${text(fact, element)})`;
      const custody = element.dotDotDotToken ? key : null;
      for (const use of readsOf(fact, decl, element.name.text)) {
        const problem = heldResultProblem(fact, unitOf(use.node), use.node, seen, custody);
        if (problem) return `is destructured into ${element.name.text}, which ${problem}`;
      }
    }
    return null;
  }

  /** A held value returned by a declared function: its call results are held. */
  function returnProblem(fact, value, seen, key) {
    let fn = value.parent;
    while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
    // Returned by a function this call is being followed into: that call's result is held.
    const frame = seen.frames?.get(fn);
    if (frame) {
      frame.add(key);
      return null;
    }
    const declared = fn ? ctx.declaredFunction(fact, fn) : null;
    if (!declared) return 'is returned from a function value';
    for (const { fact: caller, reference } of ctx.callersOf(fact, declared)) {
      if (reference.node === fn.name || reference.node === declared.local?.name) continue;
      const use = outermost(reference.node);
      if (!ts.isCallExpression(use.parent) || use.parent.expression !== use) {
        if (ts.isExportSpecifier(reference.node.parent)) continue; // re-exports are followed by key
        return `is returned by a function used as a value (${text(caller, use.parent)})`;
      }
      if (unitOf(use.parent) && caller.unchanged(unitOf(use.parent))) continue;
      const problem = heldResultProblem(caller, unitOf(use.parent), use.parent, seen, key);
      if (problem) return `is returned to ${text(caller, use.parent)}, which ${problem}`;
    }
    return null;
  }

  /** Why `call` may not receive `argument`, which holds a value, or null. */
  function consumerProblem(fact, unit, call, argument, seen, key) {
    const callee = unwrap(call.expression);
    if (ts.isPropertyAccessExpression(callee)) {
      const method = callee.name.text;
      // `receiver.query.<table>.findMany(...)`: the receiver is the client or transaction itself.
      const tables = unwrap(callee.expression);
      const query = ts.isPropertyAccessExpression(tables) ? unwrap(tables.expression) : null;
      const relational =
        RELATIONAL_METHODS.has(method) &&
        query &&
        ts.isPropertyAccessExpression(query) &&
        query.name.text === 'query'
          ? query.expression
          : null;
      if (BUILDER_METHODS.has(method) || relational) {
        const receiver = ctx.receiverProblem(fact, relational ?? callee.expression);
        return receiver ? `is handed to ${receiver}` : null;
      }
      if (COLLECTORS.has(method) || method === 'splice') {
        if (method === 'splice' && !ts.isExpressionStatement(outermost(call).parent)) {
          return `is spliced into an array whose removed elements are used`;
        }
        return containerProblem(fact, unit, callee.expression, seen);
      }
    }
    const targets = ctx.functionTargets(fact, call.expression);
    if (targets?.length) {
      seen.frames ??= new Map();
      const returned = new Set();
      for (const target of targets) {
        if (!seen.frames.has(target.fn)) seen.frames.set(target.fn, new Set());
        const index = call.arguments.indexOf(argument);
        const problem = parameterProblem(target, index, seen, key);
        if (problem) return problem;
        for (const custody of seen.frames.get(target.fn)) returned.add(custody);
      }
      for (const custody of returned) {
        const problem = heldResultProblem(fact, unit, call, seen, custody);
        if (problem) return problem;
      }
      return null;
    }
    const problem = ctx.stateCalleeProblem(fact, unit, call.expression, true);
    if (problem) return `is passed to ${problem}`;
    return heldResultProblem(
      fact,
      unit,
      call,
      seen,
      isTableAlias(fact, call.expression) ? TABLE : null
    );
  }

  /** A workspace function receives the value: its parameter is held. */
  function parameterProblem({ fact, fn }, index, seen, key) {
    const parameter = fn.parameters?.[index];
    const opaque = `is passed to a parameter that cannot be followed (${text(fact, fn).slice(0, 40)})`;
    if (index < 0 || !parameter || parameter.dotDotDotToken) return opaque;
    if (!visit(seen, parameter, key)) return null;
    if (ts.isObjectBindingPattern(parameter.name) && typeof key === 'string') {
      return patternProblem(fact, parameter.name, fn, key, seen);
    }
    if (!ts.isIdentifier(parameter.name)) return opaque;
    for (const use of readsOf(fact, fn, parameter.name.text)) {
      const problem = heldResultProblem(fact, unitOf(use.node), use.node, seen, key);
      if (problem) return `is passed to ${parameter.name.text}, which ${problem}`;
    }
    return null;
  }

  /** A local array that collects held values: every other read of it is held. */
  function containerProblem(fact, unit, container, seen) {
    const root = unwrap(container);
    const declaration = ts.isIdentifier(root) ? ctx.referenceAt(fact, root)?.binding?.decl : null;
    if (
      !declaration ||
      !ts.isVariableDeclaration(declaration) ||
      !declaration.initializer ||
      !ts.isArrayLiteralExpression(unwrap(declaration.initializer))
    ) {
      return `is collected in (${text(fact, container)})`;
    }
    return bindingProblem(fact, unit, declaration, seen, null);
  }

  /** A changed call (or tagged template) given reviewed schema state: its result is held. */
  function heldCallProblem(fact, unit, call) {
    const callee = call.expression ?? call.tag;
    const name = callee.getText(fact.sourceFile).slice(0, 40);
    if (call.tag) {
      const problem = ctx.stateCalleeProblem(fact, unit, callee, true);
      if (problem) return `is interpolated into ${problem}`;
    }
    const custody = isTableAlias(fact, callee) ? TABLE : null;
    const held = heldResultProblem(fact, unit, call, {}, custody);
    return held ? `is given to ${name} whose result ${held}` : null;
  }

  Object.assign(ctx, { heldCallProblem, heldResultProblem });
}
