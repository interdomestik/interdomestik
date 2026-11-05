// Tenant guard stage helper (L): a transaction opener read without being called in place.
//
// A Drizzle opener is a method. Detached from its client it opens a transaction only when it is
// invoked with a client-like `this`: rebound (`call`, `apply`, `bind`, `Reflect.apply`) or
// installed as a method of another object. Every read of a member named `transaction` that is
// not the callee of a direct call (a property, a literal element, a destructuring key, a
// reflective read) is therefore followed. Its value may only be tested, coerced, read for an
// inert member, propagated by an operator, aliased by a const, or handed to a stable declared
// function whose parameter obeys the same rule. Data fields that happen to be called
// `transaction` (Sentry events, Paddle transactions) pass this way; nothing else does.

import ts from 'typescript';
import { constInitializer, kindOf, tested, writes } from './rules-lifetime-forms.mjs';

const NAME = 'transaction';
const MAX_DEPTH = 16;
// Members of a function value that rebind it or reach the code evaluator.
const UNSAFE_MEMBERS = new Set(['__proto__', 'apply', 'bind', 'call', 'constructor', 'prototype']);
// Global conversions that only read a value's primitive form.
const COERCIONS = new Set(['Boolean', 'Number', 'String']);
const REFLECTORS = new Set(['Object', 'Reflect']);
const MATCHERS = new Set(['exec', 'test']);
const PROPAGATING = new Set([
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.CommaToken,
]);

/** Builds `openerProblem(fact, node)` over `ctx` and the lifetime flow's callee resolution. */
export function createOpenerChecks(ctx, { bindingOf, stableTargets, usesOf }) {
  const { outermost, referenceAt, unwrap } = ctx;
  const settled = new Map();
  const active = new Set();
  let cycle = false;
  const unbound = (fact, node) =>
    ts.isIdentifier(node) && referenceAt(fact, node) && !referenceAt(fact, node).binding;
  const keyName = key =>
    ts.isComputedPropertyName(key)
      ? ts.isStringLiteralLike(key.expression)
        ? key.expression.text
        : null
      : key.text;

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
    if (ts.isCallExpression(node) && reflectiveRead(fact, node))
      return 'a transaction opener read by reflection';
    return null;
  }

  /** `Reflect.get(x, 'transaction')`, `Object.getOwnPropertyDescriptor(p, 'transaction')`. */
  function reflectiveRead(fact, call) {
    const callee = unwrap(call.expression);
    const receiver =
      ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)
        ? unwrap(callee.expression)
        : null;
    if (!receiver || !REFLECTORS.has(receiver.text) || !unbound(fact, receiver)) return false;
    return call.arguments.some(arg => ts.isStringLiteralLike(arg) && arg.text === NAME);
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

  /** `node` evaluates to the opener. */
  function valueProblem(fact, node, depth) {
    if (depth > MAX_DEPTH) return 'a transaction opener followed beyond the analysis bound';
    const value = outermost(node);
    const parent = value.parent;
    // Invoked without a receiver: `this` is undefined, so it cannot open a transaction.
    if (ts.isCallExpression(parent) && parent.expression === value) return null;
    if (tested(value, parent) || ts.isTemplateSpan(parent)) return null;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === value)
      return memberProblem(parent.name.text);
    if (ts.isElementAccessExpression(parent) && parent.expression === value)
      return ts.isStringLiteralLike(parent.argumentExpression)
        ? memberProblem(parent.argumentExpression.text)
        : 'a computed member of a transaction opener';
    if (ts.isCallExpression(parent) && parent.arguments.includes(value))
      return argumentProblem(fact, parent, parent.arguments.indexOf(value), depth);
    if (constInitializer(parent, value))
      return ts.isIdentifier(parent.name)
        ? bindingUses(fact, parent.name, depth + 1)
        : patternProblem(parent.name);
    if (propagates(value, parent)) return valueProblem(fact, parent, depth + 1);
    return `a transaction opener used as a value (${kindOf(parent)})`;
  }

  const memberProblem = name =>
    UNSAFE_MEMBERS.has(name) ? `a transaction opener member (${name})` : null;

  /** Operators that may yield their operand: `a || b`, `a ?? b`, `c ? a : b`, `await a`. */
  function propagates(value, parent) {
    if (ts.isAwaitExpression(parent)) return true;
    if (ts.isConditionalExpression(parent)) return parent.condition !== value;
    if (!ts.isBinaryExpression(parent) || !PROPAGATING.has(parent.operatorToken.kind)) return false;
    const kind = parent.operatorToken.kind;
    return (
      parent.right === value ||
      (kind !== ts.SyntaxKind.CommaToken && kind !== ts.SyntaxKind.AmpersandAmpersandToken)
    );
  }

  /** A destructuring of the opener itself may extract only inert members. */
  function patternProblem(pattern) {
    if (!ts.isObjectBindingPattern(pattern)) return 'a transaction opener destructured as an array';
    for (const element of pattern.elements) {
      if (element.dotDotDotToken) continue;
      const name = keyName(element.propertyName ?? element.name);
      if (typeof name !== 'string') return 'a computed member of a transaction opener';
      const problem = memberProblem(name);
      if (problem) return problem;
    }
    return null;
  }

  /** The opener handed to a call: a coercion, or a stable function whose parameter obeys L. */
  function argumentProblem(fact, call, index, depth) {
    const callee = unwrap(call.expression);
    if (COERCIONS.has(callee.text) && unbound(fact, callee)) return null;
    // A regular expression literal's own matchers read only the argument's string form.
    if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isRegularExpressionLiteral(unwrap(callee.expression)) &&
      MATCHERS.has(callee.name.text)
    )
      return null;
    if (call.arguments.slice(0, index).some(ts.isSpreadElement))
      return 'a spread precedes a transaction opener argument';
    const targets = stableTargets(fact, callee);
    if (typeof targets === 'string') return `a transaction opener handed to ${targets}`;
    for (const { fact: owner, fn } of targets) {
      if (fn.parameters.slice(0, index + 1).some(param => param.dotDotDotToken))
        return 'a rest parameter receives a transaction opener';
      const param = fn.parameters[index];
      if (!param) continue;
      const problem = ts.isIdentifier(param.name)
        ? bindingUses(owner, param.name, depth + 1)
        : patternProblem(param.name);
      if (problem) return problem;
    }
    return null;
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
