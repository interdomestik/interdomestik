// Tenant guard stage helper (L): whether a borrowed transaction capability can outlive its callback.
//
// A capability is borrowed by the callback a transaction hands it to, and by every function that
// callback lends it to. Each use must keep it inside that extent: a call through the reviewed
// Drizzle surface, a test of it, an argument to a stable helper whose own parameter is borrowed in
// turn, a static property of an object literal handed to such a helper (the object then carries
// it), or a const alias. Everything else (returns, stores, closures, containers, unresolved
// callees, detached asynchronous helpers, generators) is refused. The results of capability
// calls (query builders) are not followed: their deferred dispatch is revoked at runtime.

import ts from 'typescript';
import { createLifetimeCallees } from './rules-lifetime-callees.mjs';
import {
  constInitializer,
  continues,
  joined,
  kindOf,
  memberProblem,
  otherMember,
  ownerOf,
  shapeProblem,
  tested,
} from './rules-lifetime-forms.mjs';

const MAX_DEPTH = 32;

/** Builds `paramProblem(fact, fn, index)` and `stableTargets(fact, callee)` over `ctx`. */
export function createLifetimeFlow(ctx) {
  const { isWriteTarget, keyOf, outermost, referenceAt, restCarries, returnsOf, unwrap } = ctx;
  const settled = new Map();
  const active = new Set();
  let cycle = false;
  const bindingIndex = new WeakMap();
  const text = (fact, node) => node.getText(fact.sourceFile).slice(0, 40);

  function bindingOf(fact, id) {
    let index = bindingIndex.get(fact);
    if (!index) {
      index = new Map();
      for (const { binding } of fact.references) if (binding?.id) index.set(binding.id, binding);
      bindingIndex.set(fact, index);
    }
    return index.get(id) ?? null;
  }
  const usesOf = (fact, binding) => fact.references.filter(ref => ref.binding === binding);
  const { stableTargets } = createLifetimeCallees(ctx, { bindingOf, usesOf });

  // ---- obligations: parameter `index` of `fn` borrows the capability at `path` of its argument --
  function paramProblem(fact, fn, index, path = [], depth = 0) {
    const key = `${fact.file}:${fn.pos}:${index}:${path.join('.')}`;
    if (settled.has(key)) return settled.get(key);
    if (active.has(key)) {
      cycle = true; // coinductive: assumed safe, never published while the assumption is open
      return null;
    }
    if (depth > MAX_DEPTH) return 'a forwarding chain deeper than the analysis bound';
    const outer = cycle;
    cycle = false;
    active.add(key);
    let problem;
    try {
      problem =
        shapeProblem(fact, fn, referenceAt) ?? parameterProblem(fact, fn, index, path, depth);
    } finally {
      active.delete(key);
    }
    const assumed = cycle && !problem;
    if (!assumed || active.size === 0) settled.set(key, problem);
    cycle = outer || assumed;
    return problem;
  }

  function parameterProblem(fact, fn, index, path, depth) {
    const params = fn.parameters;
    if (params.slice(0, index + 1).some(param => param.dotDotDotToken))
      return 'a rest parameter receives it';
    const param = params[index];
    return param ? patternProblem(fact, param.name, path, fn, depth) : null;
  }

  /** A binding name (identifier or object pattern) receives the capability at `path`. */
  function patternProblem(fact, name, path, owner, depth) {
    if (ts.isIdentifier(name)) return bindingProblem(fact, name, path, owner, depth);
    if (path.length === 0) return 'a destructured capability (its members are extracted)';
    if (!ts.isObjectBindingPattern(name)) return 'an array pattern carries it';
    const [head, ...rest] = path;
    for (const element of name.elements) {
      if (element.dotDotDotToken) {
        if (restCarries(name, head)) return patternProblem(fact, element.name, path, owner, depth);
        continue;
      }
      const key = ctx.elementKey(element);
      if (typeof key !== 'string') return 'a computed binding key';
      if (key === head) return patternProblem(fact, element.name, rest, owner, depth);
    }
    return null;
  }

  function bindingProblem(fact, id, path, owner, depth) {
    const binding = bindingOf(fact, id);
    if (!binding) return null;
    for (const use of usesOf(fact, binding)) {
      if (isWriteTarget(outermost(use.node))) return `a reassigned capability binding (${id.text})`;
      // A carrier's other members are plain data: reading them anywhere lends nothing.
      if (otherMember(use.node, path) && !calledMember(use.node.parent)) continue;
      if (ownerOf(use.node) !== owner) return `a nested function captures it (${id.text})`;
      const problem =
        path.length === 0
          ? valueProblem(fact, use.node, owner, depth)
          : carrierProblem(fact, use.node, path, owner, depth);
      if (problem) return problem;
    }
    return null;
  }

  /** `node` evaluates to the borrowed capability itself. */
  function valueProblem(fact, node, owner, depth) {
    const value = outermost(node);
    const parent = value.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === value)
      return memberProblem(parent, outermost);
    if (ts.isCallExpression(parent) && parent.arguments.includes(value))
      return argumentProblem(fact, parent, parent.arguments.indexOf(value), [], depth);
    const carried = carrierOf(value, parent);
    if (carried)
      return (
        carried.problem ?? argumentProblem(fact, carried.call, carried.index, [carried.key], depth)
      );
    if (constInitializer(parent, value)) return patternProblem(fact, parent.name, [], owner, depth);
    if (tested(value, parent)) return null;
    return `the capability escapes its callback (${kindOf(parent)})`;
  }

  /** A carrier member that is invoked: it could reach the carrier through `this`. */
  function calledMember(access) {
    const member = outermost(access);
    return ts.isCallExpression(member.parent) && member.parent.expression === member;
  }

  /** `node` holds an object whose `path` is the borrowed capability. */
  function carrierProblem(fact, node, path, owner, depth) {
    const value = outermost(node);
    const parent = value.parent;
    const [head, ...rest] = path;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === value) {
      if (parent.name.text !== head)
        return calledMember(parent) ? `a carrier method call (${parent.name.text})` : null;
      if (isWriteTarget(outermost(parent))) return `a reassigned carrier member (${head})`;
      return rest.length === 0
        ? valueProblem(fact, parent, owner, depth)
        : carrierProblem(fact, parent, rest, owner, depth);
    }
    if (ts.isCallExpression(parent) && parent.arguments.includes(value))
      return argumentProblem(fact, parent, parent.arguments.indexOf(value), path, depth);
    const carried = carrierOf(value, parent);
    if (carried) {
      const nested = [carried.key, ...path];
      return carried.problem ?? argumentProblem(fact, carried.call, carried.index, nested, depth);
    }
    if (constInitializer(parent, value))
      return patternProblem(fact, parent.name, path, owner, depth);
    if (tested(value, parent)) return null;
    return `the capability carrier escapes its callback (${kindOf(parent)})`;
  }

  /** A static property of an object literal handed directly to a call, or a problem, or null. */
  function carrierOf(value, parent) {
    const property =
      ts.isShorthandPropertyAssignment(parent) ||
      (ts.isPropertyAssignment(parent) && parent.initializer === value)
        ? parent
        : null;
    if (!property) return null;
    const literal = property.parent;
    const unsafe = literal.properties.find(
      member =>
        typeof keyOf(member) !== 'string' ||
        !(ts.isPropertyAssignment(member) || ts.isShorthandPropertyAssignment(member)) ||
        (ts.isPropertyAssignment(member) && ts.isFunctionExpression(unwrap(member.initializer)))
    );
    if (unsafe) return { problem: 'a carrier object with spreads, methods or computed keys' };
    const carried = outermost(literal);
    const call = carried.parent;
    if (!ts.isCallExpression(call) || !call.arguments.includes(carried))
      return { problem: `a carrier object that is not a call argument (${kindOf(call)})` };
    return { call, index: call.arguments.indexOf(carried), key: keyOf(property) };
  }

  /** The capability (at `path` of argument `index`) is handed to `call`. */
  function argumentProblem(fact, call, index, path, depth) {
    if (call.questionDotToken) return 'an optional call receives it';
    if (call.arguments.slice(0, index).some(ts.isSpreadElement)) return 'a spread precedes it';
    const targets = stableTargets(fact, unwrap(call.expression));
    if (typeof targets === 'string') return targets;
    for (const target of targets) {
      if (continues(target.fn, index, path, { returnsOf, unwrap }) && !joined(call, outermost))
        return `an asynchronous helper that is not awaited (${text(fact, call.expression)})`;
      const problem = paramProblem(target.fact, target.fn, index, path, depth + 1);
      if (problem) return `${text(fact, call.expression)}: ${problem}`;
    }
    return null;
  }

  return { paramProblem, stableTargets };
}
