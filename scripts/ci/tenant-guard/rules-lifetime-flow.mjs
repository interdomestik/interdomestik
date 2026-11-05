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
import { byCodeUnit } from './rules-digest.mjs';
import {
  captureBoundary,
  constInitializer,
  hoistedDeclarations,
  IMPLICIT_MEMBERS,
  isAsync,
  joined,
  kindOf,
  memberProblem,
  otherMember,
  shapeProblem,
  tested,
  writes,
} from './rules-lifetime-forms.mjs';

const MAX_DEPTH = 32;

/** Builds `paramProblem(fact, fn, index)`, `stableTargets(fact, callee)` and the binding lookups
 * (`bindingOf`, `usesOf`) over `ctx`. */
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
    const keys = owned.map(set => [...set].sort(byCodeUnit));
    const key = JSON.stringify([fact.file, fn.pos, index, path, keys]);
    if (settled.has(key)) return settled.get(key);
    if (active.has(key)) {
      cycle = true; // coinductive: assumed safe, never published while the assumption is open
      return { problem: null, lent: true };
    }
    if (depth > MAX_DEPTH)
      return { problem: 'a forwarding chain deeper than the analysis bound', lent: true };
    // A reviewed runner lends this borrow to its callback, which is checked at the call site.
    if (ctx.lifetimeRunnerChecks?.lends(fn, index))
      return path.length === 0
        ? { problem: null, lent: true }
        : { problem: 'a carrier handed to a reviewed runner', lent: true };
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
    const taken = takenKeys(name, owned[0]);
    if (taken.problem) return taken.problem;
    // Every element binding the property borrows it: `{ x: u, x: v }` binds it twice.
    const scope = { path, owned, owner, depth, keys: taken.keys };
    for (const element of name.elements) {
      const problem = elementProblem(fact, name, element, scope);
      if (problem) return problem;
    }
    return null;
  }

  /** The static keys a pattern takes, each one a key the carrier owns. */
  function takenKeys(name, ownedKeys) {
    const keys = [];
    for (const element of name.elements) {
      if (element.dotDotDotToken) continue;
      const key = ctx.elementKey(element);
      if (typeof key !== 'string') return { problem: 'a computed binding key', keys };
      if (!ownedKeys.has(key))
        return { problem: `a destructured member the carrier does not own (${key})`, keys };
      keys.push(key);
    }
    return { problem: null, keys };
  }

  /** One element of a pattern that receives the carrier at `path`. */
  function elementProblem(fact, name, element, { path, owned, owner, depth, keys }) {
    const [head, ...rest] = path;
    if (element.dotDotDotToken) {
      if (!restCarries(name, head)) return null;
      // The rest object owns exactly the keys the pattern did not take.
      const remaining = new Set([...owned[0]].filter(key => !keys.includes(key)));
      return patternProblem(fact, element.name, path, [remaining, ...owned.slice(1)], owner, depth);
    }
    if (ctx.elementKey(element) !== head) return null;
    return patternProblem(fact, element.name, rest, owned.slice(1), owner, depth);
  }

  function bindingProblem(fact, id, path, owned, owner, depth) {
    // A hoisted `var` or function of the same name rebinds it, and the uses resolve elsewhere.
    if (hoistedDeclarations(owner, id.text) > 0)
      return `a redeclared capability binding (${id.text})`;
    const binding = bindingOf(fact, id);
    if (!binding) return null;
    for (const use of usesOf(fact, binding)) {
      const problem = useProblem(fact, id, use.node, { path, owned, owner, depth });
      if (problem) return problem;
    }
    return null;
  }

  /** One use of a binding that holds the capability, or a carrier of it at `path`. */
  function useProblem(fact, id, node, { path, owned, owner, depth }) {
    if (writes(node, ctx)) return `a reassigned capability binding (${id.text})`;
    // A closure or class over the binding retains the whole carrier, whichever member it reads.
    if (captureBoundary(node) !== owner)
      return `a nested function or class captures it (${id.text})`;
    // A carrier's other own members are plain data: reading them in place lends nothing.
    if (otherMember(node, path)) {
      const member = node.parent.name.text;
      if (!owned[0].has(member)) return `a member the carrier does not own (${member})`;
      // Deleting or replacing an own member could expose an inherited one to later reads.
      if (writes(node.parent, ctx)) return `a written carrier member (${member})`;
      if (!calledMember(node.parent)) return null;
    }
    return path.length === 0
      ? valueProblem(fact, node, owner, depth)
      : carrierProblem(fact, node, path, owned, owner, depth);
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
    if (carried) return carriedProblem(fact, carried, [], [], depth);
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

  /** A carrier member that is invoked (a call or a tagged template): it could reach the carrier
   * through `this`. */
  function calledMember(access) {
    const member = outermost(access);
    const parent = member.parent;
    return (
      (ts.isCallExpression(parent) && parent.expression === member) ||
      (ts.isTaggedTemplateExpression(parent) && parent.tag === member)
    );
  }

  /** `node` holds an object whose `path` is the borrowed capability. */
  function carrierProblem(fact, node, path, owned, owner, depth) {
    const value = outermost(node);
    const parent = value.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === value)
      return carrierMemberProblem(fact, parent, { path, owned, owner, depth });
    if (ts.isCallExpression(parent) && parent.arguments.includes(value))
      return argumentProblem(fact, parent, parent.arguments.indexOf(value), path, owned, depth);
    const carried = carrierOf(value, parent);
    if (carried) return carriedProblem(fact, carried, path, owned, depth);
    if (constInitializer(parent, value))
      return patternProblem(fact, parent.name, path, owned, owner, depth);
    if (tested(value, parent)) return null;
    return `the capability carrier escapes its callback (${kindOf(parent)})`;
  }

  /** A member read of the carrier: its own data, or the borrowed capability one level down. */
  function carrierMemberProblem(fact, access, { path, owned, owner, depth }) {
    const [head, ...rest] = path;
    const member = access.name.text;
    if (!owned[0].has(member)) return `a member the carrier does not own (${member})`;
    if (member !== head && writes(access, ctx)) return `a written carrier member (${member})`;
    if (member !== head) return calledMember(access) ? `a carrier method call (${member})` : null;
    if (writes(access, ctx)) return `a reassigned carrier member (${head})`;
    return rest.length === 0
      ? valueProblem(fact, access, owner, depth)
      : carrierProblem(fact, access, rest, owned.slice(1), owner, depth);
  }

  /** The literal carrying the capability (or its carrier) is handed to a call as an argument. */
  function carriedProblem(fact, carried, path, owned, depth) {
    if (carried.problem) return carried.problem;
    const { call, index, key, keys } = carried;
    return argumentProblem(fact, call, index, [key, ...path], [keys, ...owned], depth);
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
    const unsafe = literal.properties.some(
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
    const { problem: unstable, targets } = stableTargets(fact, unwrap(call.expression));
    if (unstable) return unstable;
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

  return { bindingOf, paramProblem, stableTargets, usesOf };
}
