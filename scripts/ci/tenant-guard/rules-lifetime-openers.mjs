// Tenant guard stage helper (L): a transaction opener read without being called in place.
//
// A Drizzle opener is a method. Detached from its client it opens a transaction only when it is
// invoked with a client-like `this`: rebound (`call`, `apply`, `bind`, `Reflect.apply`) or
// installed as a method of another object. Every read of a member named `transaction` that is
// not the callee of a direct call (a property, a literal element, a destructuring key, a
// reflective read) is therefore followed through an allowlist: it may only be tested, read for an
// inert member that is not invoked, converted by `String`, or handed to a stable declared function
// whose parameter obeys the same allowlist. Data fields that happen to be called
// `transaction` (Sentry events, Paddle transactions) pass this way; nothing else does.

import ts from 'typescript';
import {
  hoistedDeclarations,
  kindOf,
  shapeProblem,
  tested,
  writes,
} from './rules-lifetime-forms.mjs';

const NAME = 'transaction';
const MAX_DEPTH = 16;
// Members of a function value that rebind it or reach the code evaluator.
const UNSAFE_MEMBERS = new Set(['__proto__', 'apply', 'bind', 'call', 'constructor', 'prototype']);
// The one global conversion admitted: it reads only the value's string form.
const COERCION = 'String';

/** Builds `openerProblem(fact, node)` over `ctx` and the lifetime flow's callee resolution. */
export function createOpenerChecks(ctx, { bindingOf, stableTargets, usesOf }) {
  const { outermost, referenceAt, unwrap } = ctx;
  const settled = new Map();
  const active = new Set();
  let cycle = false;
  const unbound = (fact, node) =>
    ts.isIdentifier(node) && referenceAt(fact, node) && !referenceAt(fact, node).binding;
  const keyName = key => {
    if (!ts.isComputedPropertyName(key)) return key.text;
    return ts.isStringLiteralLike(key.expression) ? key.expression.text : null;
  };

  /** Why the read at `node` lets a transaction opener be invoked unseen, or null. */
  function openerProblem(fact, node) {
    if (ts.isPropertyAccessExpression(node) && node.name.text === NAME)
      return readProblem(fact, node);
    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      node.argumentExpression.text === NAME
    )
      return readProblem(fact, node);
    if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
      if (keyName(node.propertyName ?? node.name) !== NAME) return null;
      return ts.isIdentifier(node.name)
        ? bindingUses(fact, node.name, 0)
        : 'a transaction opener destructured further';
    }
    if (
      (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
      keyName(node.name) === NAME &&
      writes(node.parent, ctx)
    )
      return 'a transaction opener read by a destructuring assignment';
    // Reflective reads (`Reflect.get`, property descriptors) are refused by the loader checks.
    return null;
  }

  /** A read whose value is not called in place. A plain assignment target reads nothing. */
  function readProblem(fact, node) {
    const value = outermost(node);
    if (ts.isCallExpression(value.parent) && value.parent.expression === value) return null;
    const parent = value.parent;
    if (
      ts.isBinaryExpression(parent) &&
      parent.left === value &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
    )
      return null;
    return valueProblem(fact, node, 0);
  }

  /** `node` evaluates to the opener. An allowlist: it may be tested, read for an inert member,
   * converted by `String`, or handed to a stable declared function whose parameter obeys the
   * same allowlist. Aliases, operators, templates and every other use are refused. */
  function valueProblem(fact, node, depth) {
    if (depth > MAX_DEPTH) return 'a transaction opener followed beyond the analysis bound';
    const value = outermost(node);
    const parent = value.parent;
    if (tested(value, parent)) return null;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === value)
      return memberProblem(parent, parent.name.text);
    if (ts.isElementAccessExpression(parent) && parent.expression === value)
      return ts.isStringLiteralLike(parent.argumentExpression)
        ? memberProblem(parent, parent.argumentExpression.text)
        : 'a computed member of a transaction opener';
    if (ts.isCallExpression(parent) && parent.arguments.includes(value))
      return argumentProblem(fact, parent, parent.arguments.indexOf(value), depth);
    return `a transaction opener used as a value (${kindOf(parent)})`;
  }

  /** A member read of the opener: never a rebinding one, never written (an own `toString` or
   * `valueOf` would run with the opener as `this` when it is converted), and never invoked (an
   * inherited method such as `valueOf` returns its receiver). */
  function memberProblem(access, name) {
    if (UNSAFE_MEMBERS.has(name)) return `a transaction opener member (${name})`;
    if (writes(access, ctx)) return `a transaction opener member written (${name})`;
    const member = outermost(access);
    const parent = member.parent;
    const invoked =
      (ts.isCallExpression(parent) && parent.expression === member) ||
      (ts.isTaggedTemplateExpression(parent) && parent.tag === member);
    return invoked ? `a method of a transaction opener invoked (${name})` : null;
  }

  /** The opener handed to a call: `String`, or a stable function whose parameter obeys L. */
  function argumentProblem(fact, call, index, depth) {
    const callee = unwrap(call.expression);
    if (COERCION === callee.text && unbound(fact, callee) && call.arguments.length === 1)
      return null;
    if (call.arguments.slice(0, index).some(ts.isSpreadElement))
      return 'a spread precedes a transaction opener argument';
    const { problem: unstable, targets } = stableTargets(fact, callee);
    if (unstable) return `a transaction opener handed to ${unstable}`;
    for (const { fact: owner, fn } of targets) {
      const problem = receiverProblem(owner, fn, index, depth);
      if (problem) return problem;
    }
    return null;
  }

  /** Parameter `index` of the stable function `fn` receives the opener and obeys L. */
  function receiverProblem(owner, fn, index, depth) {
    // Implicit `arguments`, an erased `this` parameter or `this` itself would reach it unseen.
    const shape = shapeProblem(owner, fn, referenceAt);
    if (shape) return `a transaction opener handed to ${shape}`;
    if (fn.parameters.slice(0, index + 1).some(param => param.dotDotDotToken))
      return 'a rest parameter receives a transaction opener';
    const param = fn.parameters[index];
    if (!param) return null;
    if (!ts.isIdentifier(param.name)) return 'a transaction opener parameter destructured';
    if (param.initializer) return 'a transaction opener parameter with a default';
    if (hoistedDeclarations(fn, param.name.text) > 0)
      return `a redeclared transaction opener parameter (${param.name.text})`;
    return bindingUses(owner, param.name, depth + 1);
  }

  /** Every use of the binding `id` holds the opener. A cycle is assumed safe (each use on it is
   * checked) and a result resting on an open assumption is never cached. */
  function bindingUses(fact, id, depth) {
    const binding = bindingOf(fact, id);
    if (!binding) return null;
    const key = `${fact.file}:${id.pos}`;
    if (settled.has(key)) return settled.get(key);
    if (active.has(key)) {
      cycle = true;
      return null;
    }
    const outer = cycle;
    cycle = false;
    active.add(key);
    let problem = null;
    for (const use of usesOf(fact, binding)) {
      problem = writes(use.node, ctx)
        ? `a reassigned transaction opener binding (${id.text})`
        : valueProblem(fact, use.node, depth);
      if (problem) break;
    }
    active.delete(key);
    const assumed = cycle && !problem;
    if (!assumed || active.size === 0) settled.set(key, problem);
    cycle = outer || assumed;
    return problem;
  }

  return { openerProblem };
}
