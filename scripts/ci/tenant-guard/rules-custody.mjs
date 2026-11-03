// Tenant guard stage: custody of values that hold reviewed schema state (A5-r2 Q5).
//
// An imported operator does not detach what it is given: Drizzle `eq(claims.id, x)` keeps the
// column object itself in the returned SQL (`queryChunks`), so the result is an alias of schema
// state. In changed code it may only be bound, collected, composed, passed to workspace functions
// (the parameter is held), returned from declared functions and consumed by a query builder;
// anything else is refused. Custody is finite: held whole, at one static object key (`{ where }`)
// or as a Drizzle table alias (each member is a held column); deeper or unknown keys are whole.

import ts from 'typescript';
import {
  COLLECTORS,
  RELATIONAL_METHODS,
  SQL_METHODS,
  TABLE,
  UNDECIDED,
  UNKNOWN,
  isDiscarded,
  isReturnedValue,
  passesThrough,
  propertyKey,
  relationalReceiver,
  tableAliasCallee,
} from './rules-custody-forms.mjs';
import { unitOf } from './syntax.mjs';

/** Installs the held-value (custody) analysis on `ctx`. */
export function installCustody(ctx) {
  const { BUILDER_METHODS, outermost, unwrap, yieldsOperand } = ctx;
  const staticKey = name => propertyKey(name, unwrap);

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
    seen.visited ??= new Map();
    const keys = seen.visited.get(node) ?? new Set();
    if (keys.has(key)) return false;
    seen.visited.set(node, keys.add(key));
    return true;
  };
  const isTableAlias = (fact, callee) => tableAliasCallee(fact, callee, unwrap, ctx.referenceAt);
  // The first problem of the held reads of `name`, each in the unit `unitAt` gives it.
  const readsProblem = (fact, decl, name, held) => {
    for (const use of readsOf(fact, decl, name)) {
      const problem = heldResultProblem(fact, held.unitAt(use.node), use.node, held.seen, held.key);
      if (problem) return problem;
    }
    return null;
  };

  /** Why a held value may not go where it goes, or null. `key` is its custody (see above). */
  function heldResultProblem(fact, unit, held, seen = {}, key = null) {
    if (!visit(seen, held, key)) return null;
    const value = outermost(held);
    const parent = value.parent;
    const next = (node, custody = key) => heldResultProblem(fact, unit, node, seen, custody);
    if (passesThrough(parent, value, yieldsOperand)) return next(parent);
    if (isDiscarded(parent, value)) return null;
    const flow = { fact, unit, value, parent, seen, key, next };
    for (const stage of [consumedProblem, composedProblem, boundProblem]) {
      const problem = stage(flow);
      if (problem !== UNDECIDED) return problem;
    }
    if (isReturnedValue(parent, value)) return returnProblem(fact, value, seen, key);
    return `escapes (${text(fact, parent)})`;
  }

  function consumedProblem({ fact, unit, value, parent, seen, key, next }) {
    if (ts.isCallExpression(parent) && parent.arguments.includes(value)) {
      return consumerProblem({ fact, unit, call: parent, argument: value, seen, key });
    }
    if (ts.isSpreadElement(parent) && ts.isCallExpression(parent.parent)) {
      return consumerProblem({ fact, unit, call: parent.parent, argument: parent, seen, key });
    }
    if (ts.isPropertyAccessExpression(parent) && parent.expression === value) {
      return memberProblem(fact, parent, next, key);
    }
    return UNDECIDED;
  }

  // Composed into a literal that is not (yet) an argument.
  function composedProblem({ fact, value, parent, key, next }) {
    if (ts.isArrayLiteralExpression(parent)) return next(parent, null);
    if (ts.isSpreadElement(parent) && ts.isArrayLiteralExpression(parent.parent)) {
      return next(parent.parent, null);
    }
    if (ts.isSpreadAssignment(parent)) return next(parent.parent, key);
    if (
      ts.isShorthandPropertyAssignment(parent) ||
      (ts.isPropertyAssignment(parent) && parent.initializer === value)
    ) {
      // `{ __proto__: held }` makes it the prototype: refused in every spelling.
      const name = staticKey(parent.name);
      if (name === '__proto__') return `sets an object prototype (${text(fact, parent)})`;
      return next(parent.parent, key === null && name !== UNKNOWN ? name : null);
    }
    return UNDECIDED;
  }

  function boundProblem({ fact, unit, value, parent, seen, key }) {
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
    return UNDECIDED;
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
    const name = declaration.name.text;
    const problem = readsProblem(fact, declaration, name, { unitAt: () => unit, seen, key });
    return problem ? `is held by ${name}, which ${problem}` : null;
  }

  /** `{ [key]: name, ...rest }` taken from an object that holds a value at `key`. */
  function patternProblem(fact, pattern, decl, key, seen) {
    for (const element of pattern.elements) {
      const name = element.dotDotDotToken ? key : staticKey(element.propertyName ?? element.name);
      if (name === UNKNOWN) return `is destructured by a computed key (${text(fact, element)})`;
      if (name !== key) continue;
      if (!ts.isIdentifier(element.name)) return `is destructured (${text(fact, element)})`;
      const custody = element.dotDotDotToken ? key : null;
      const held = { unitAt: unitOf, seen, key: custody };
      const problem = readsProblem(fact, decl, element.name.text, held);
      if (problem) return `is destructured into ${element.name.text}, which ${problem}`;
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
      const problem = callerResultProblem(caller, reference, seen, key);
      if (problem) return problem;
    }
    return null;
  }

  function callerResultProblem(caller, reference, seen, key) {
    const use = outermost(reference.node);
    if (!ts.isCallExpression(use.parent) || use.parent.expression !== use) {
      if (ts.isExportSpecifier(reference.node.parent)) return null; // re-exports are followed by key
      return `is returned by a function used as a value (${text(caller, use.parent)})`;
    }
    if (unitOf(use.parent) && caller.unchanged(unitOf(use.parent))) return null;
    const problem = heldResultProblem(caller, unitOf(use.parent), use.parent, seen, key);
    return problem ? `is returned to ${text(caller, use.parent)}, which ${problem}` : null;
  }

  /** Why `call` may not receive `argument`, which holds a value, or null. */
  function consumerProblem(use) {
    const { fact, unit, call, seen } = use;
    const callee = unwrap(call.expression);
    if (ts.isPropertyAccessExpression(callee)) {
      const problem = methodConsumerProblem(fact, unit, call, callee, seen);
      if (problem !== UNDECIDED) return problem;
    }
    const targets = ctx.functionTargets(fact, call.expression);
    if (targets?.length) return targetsProblem(use, targets);
    const problem = ctx.stateCalleeProblem(fact, unit, call.expression, true);
    if (problem) return `is passed to ${problem}`;
    const custody = isTableAlias(fact, call.expression) ? TABLE : null;
    return heldResultProblem(fact, unit, call, seen, custody);
  }

  function methodConsumerProblem(fact, unit, call, callee, seen) {
    const method = callee.name.text;
    // `receiver.query.<table>.findMany(...)`: the receiver is the client or transaction itself.
    const relational = RELATIONAL_METHODS.has(method) ? relationalReceiver(callee, unwrap) : null;
    if (BUILDER_METHODS.has(method) || relational) {
      const receiver = ctx.receiverProblem(fact, relational ?? callee.expression);
      return receiver ? `is handed to ${receiver}` : null;
    }
    if (!COLLECTORS.has(method) && method !== 'splice') return UNDECIDED;
    if (method === 'splice' && !ts.isExpressionStatement(outermost(call).parent)) {
      return `is spliced into an array whose removed elements are used`;
    }
    return containerProblem(fact, unit, callee.expression, seen);
  }

  /** Workspace functions receive the value; what each returns of it is held at the call. */
  function targetsProblem({ fact, unit, call, argument, seen, key }, targets) {
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
    const name = parameter.name.text;
    const problem = readsProblem(fact, fn, name, { unitAt: unitOf, seen, key });
    return problem ? `is passed to ${name}, which ${problem}` : null;
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
