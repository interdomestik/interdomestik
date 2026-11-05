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
  hoistedDeclarations,
  IMPLICIT_MEMBERS,
  isAsync,
  joined,
  kindOf,
  memberProblem,
  otherMember,
  ownerOf,
  shapeProblem,
  tested,
  writes,
} from './rules-lifetime-forms.mjs';

const MAX_DEPTH = 32;

/** Builds `paramProblem(fact, fn, index)` and `stableTargets(fact, callee)` over `ctx`. */
export function createLifetimeFlow(ctx) {
  const { keyOf, outermost, referenceAt, restCarries, unwrap } = ctx;
  const settled = new Map();
  const frames = [];
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
  // `owned[i]` are the own keys of the object literal at `path[i]`: only those may be read, since a
  // missing key is looked up on the prototype, where a getter could receive the carrier as `this`.
  // `lent`: the function hands the capability on (to a helper or a nested transaction), so a call
  // to it may still use the capability after it returns unless that call is joined.
  const paramProblem = (fact, fn, index) => obligation(fact, fn, index, [], [], 0).problem;
  function obligation(fact, fn, index, path, owned, depth) {
    const keys = owned.map(set => [...set].sort().join(',')).join('|');
    const key = `${fact.file}:${fn.pos}:${index}:${path.join('.')}:${keys}`;
    if (settled.has(key)) return settled.get(key);
    if (active.has(key)) {
      cycle = true; // coinductive: assumed safe, never published while the assumption is open
      return { problem: null, lent: true };
    }
    if (depth > MAX_DEPTH)
      return { problem: 'a forwarding chain deeper than the analysis bound', lent: true };
    const outer = cycle;
    cycle = false;
    active.add(key);
    const frame = { lent: false };
    frames.push(frame);
    let problem;
    try {
      problem =
        shapeProblem(fact, fn, referenceAt) ??
        parameterProblem(fact, fn, index, path, owned, depth);
    } finally {
      frames.pop();
      active.delete(key);
    }
    const result = { problem, lent: frame.lent };
    const assumed = cycle && !problem;
    if (!assumed || active.size === 0) settled.set(key, result);
    cycle = outer || assumed;
    return result;
  }
  const lend = () => {
    if (frames.length > 0) frames.at(-1).lent = true;
  };

  function parameterProblem(fact, fn, index, path, owned, depth) {
    const params = fn.parameters;
    if (params.slice(0, index + 1).some(param => param.dotDotDotToken))
      return 'a rest parameter receives it';
    const param = params[index];
    return param ? patternProblem(fact, param.name, path, owned, fn, depth) : null;
  }

  /** A binding name (identifier or object pattern) receives the capability at `path`. */
  function patternProblem(fact, name, path, owned, owner, depth) {
    if (ts.isIdentifier(name)) return bindingProblem(fact, name, path, owned, owner, depth);
    if (path.length === 0) return 'a destructured capability (its members are extracted)';
    if (!ts.isObjectBindingPattern(name)) return 'an array pattern carries it';
    const [head, ...rest] = path;
    const keys = [];
    for (const element of name.elements) {
      if (element.dotDotDotToken) continue;
      const key = ctx.elementKey(element);
      if (typeof key !== 'string') return 'a computed binding key';
      if (!owned[0].has(key)) return `a destructured member the carrier does not own (${key})`;
      keys.push(key);
    }
    // Every element binding the property borrows it: `{ x: u, x: v }` binds it twice.
    for (const element of name.elements) {
      let problem = null;
      if (element.dotDotDotToken) {
        // The rest object owns exactly the keys the pattern did not take.
        const remaining = new Set([...owned[0]].filter(key => !keys.includes(key)));
        if (restCarries(name, head))
          problem = patternProblem(
            fact,
            element.name,
            path,
            [remaining, ...owned.slice(1)],
            owner,
            depth
          );
      } else if (ctx.elementKey(element) === head) {
        problem = patternProblem(fact, element.name, rest, owned.slice(1), owner, depth);
      }
      if (problem) return problem;
    }
    return null;
  }

  function bindingProblem(fact, id, path, owned, owner, depth) {
    // A hoisted `var` or function of the same name rebinds it, and the uses resolve elsewhere.
    if (hoistedDeclarations(owner, id.text) > 0)
      return `a redeclared capability binding (${id.text})`;
    const binding = bindingOf(fact, id);
    if (!binding) return null;
    for (const use of usesOf(fact, binding)) {
      if (writes(use.node, ctx)) return `a reassigned capability binding (${id.text})`;
      // A carrier's other own members are plain data: reading them anywhere lends nothing.
      if (otherMember(use.node, path)) {
        const member = use.node.parent.name.text;
        if (!owned[0].has(member)) return `a member the carrier does not own (${member})`;
        if (!calledMember(use.node.parent)) continue;
      }
      if (ownerOf(use.node) !== owner) return `a nested function captures it (${id.text})`;
      const problem =
        path.length === 0
          ? valueProblem(fact, use.node, owner, depth)
          : carrierProblem(fact, use.node, path, owned, owner, depth);
      if (problem) return problem;
    }
    return null;
  }

  /** `node` evaluates to the borrowed capability itself. */
  function valueProblem(fact, node, owner, depth) {
    const value = outermost(node);
    const parent = value.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === value)
      return memberProblem(parent, outermost) ?? openingProblem(parent);
    if (ts.isCallExpression(parent) && parent.arguments.includes(value))
      return argumentProblem(fact, parent, parent.arguments.indexOf(value), [], [], depth);
    const carried = carrierOf(value, parent);
    if (carried) {
      if (carried.problem) return carried.problem;
      const { call, index, key, keys } = carried;
      return argumentProblem(fact, call, index, [key], [keys], depth);
    }
    if (constInitializer(parent, value))
      return patternProblem(fact, parent.name, [], [], owner, depth);
    if (tested(value, parent)) return null;
    return `the capability escapes its callback (${kindOf(parent)})`;
  }

  /** A nested transaction opened on the capability runs its callback later: it must be joined. */
  function openingProblem(access) {
    if (access.name.text !== 'transaction' || !calledMember(access)) return null;
    lend();
    const opened = outermost(access).parent;
    return joined(opened, outermost) ? null : 'a nested transaction that is not awaited';
  }

  /** A carrier member that is invoked: it could reach the carrier through `this`. */
  function calledMember(access) {
    const member = outermost(access);
    return ts.isCallExpression(member.parent) && member.parent.expression === member;
  }

  /** `node` holds an object whose `path` is the borrowed capability. */
  function carrierProblem(fact, node, path, owned, owner, depth) {
    const value = outermost(node);
    const parent = value.parent;
    const [head, ...rest] = path;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === value) {
      const member = parent.name.text;
      if (!owned[0].has(member)) return `a member the carrier does not own (${member})`;
      if (member !== head) return calledMember(parent) ? `a carrier method call (${member})` : null;
      if (writes(parent, ctx)) return `a reassigned carrier member (${head})`;
      return rest.length === 0
        ? valueProblem(fact, parent, owner, depth)
        : carrierProblem(fact, parent, rest, owned.slice(1), owner, depth);
    }
    if (ts.isCallExpression(parent) && parent.arguments.includes(value))
      return argumentProblem(fact, parent, parent.arguments.indexOf(value), path, owned, depth);
    const carried = carrierOf(value, parent);
    if (carried) {
      if (carried.problem) return carried.problem;
      const { call, index, key, keys } = carried;
      return argumentProblem(fact, call, index, [key, ...path], [keys, ...owned], depth);
    }
    if (constInitializer(parent, value))
      return patternProblem(fact, parent.name, path, owned, owner, depth);
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
        keyOf(member) === '__proto__' ||
        IMPLICIT_MEMBERS.has(keyOf(member)) ||
        !(ts.isPropertyAssignment(member) || ts.isShorthandPropertyAssignment(member)) ||
        (ts.isPropertyAssignment(member) && ts.isFunctionExpression(unwrap(member.initializer)))
    );
    if (unsafe) return { problem: 'a carrier object with spreads, methods or computed keys' };
    const carried = outermost(literal);
    const call = carried.parent;
    if (!ts.isCallExpression(call) || !call.arguments.includes(carried))
      return { problem: `a carrier object that is not a call argument (${kindOf(call)})` };
    const keys = new Set(literal.properties.map(keyOf));
    return { call, index: call.arguments.indexOf(carried), key: keyOf(property), keys };
  }

  /** The capability (at `path` of argument `index`) is handed to `call`. */
  function argumentProblem(fact, call, index, path, owned, depth) {
    if (call.questionDotToken) return 'an optional call receives it';
    if (call.arguments.slice(0, index).some(ts.isSpreadElement)) return 'a spread precedes it';
    const targets = stableTargets(fact, unwrap(call.expression));
    if (typeof targets === 'string') return targets;
    for (const target of targets) {
      const { problem, lent } = obligation(target.fact, target.fn, index, path, owned, depth + 1);
      if (problem) return `${text(fact, call.expression)}: ${problem}`;
      // A helper that may still run continues this function too, once its call is joined here.
      if (!lent && !isAsync(target.fn)) continue;
      if (!joined(call, outermost))
        return `an asynchronous helper that is not awaited (${text(fact, call.expression)})`;
      lend();
    }
    return null;
  }

  return { paramProblem, stableTargets };
}
