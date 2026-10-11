import ts from 'typescript';
import { digest } from './db-access-trust.mjs';
import { createLocalInvocations } from './db-access-invocations.mjs';
import { createInvocationEffects } from './db-access-invocation-effects.mjs';
import { createReferences } from './db-access-references.mjs';
import { isFunction, ownerOf } from './db-access-source.mjs';
import {
  checkDispatchLimits,
  createDependencyMemo,
  createDispatchBudget,
} from './db-access-dispatch-budget.mjs';

// Shared source-bound invocation alternatives. No caller/root is removed. A local function
// target is only dispatch evidence: its body, arguments, returns and intermediaries remain work.
// Work accounting: the first frame of every parsed call is finite source traversal and is never
// skipped or charged. Every further caller frame and every invocation-context registration is
// semantic expansion, charged against maxEntries per round; exhaustion fails closed for every
// call. Within one build, a (call, frame token) resolution and its unknown-call escape effects are
// reused only while every escape answer they observed is unchanged (db-access-dispatch-budget.mjs).
export function createDispatch(model, legacy, { maxRounds = 16, maxEntries = 20000 } = {}) {
  checkDispatchLimits({ maxRounds, maxEntries });
  const callNodes = [];
  for (const sf of model.parsed.values())
    model.walk(sf, node => {
      if (ts.isCallExpression(node)) callNodes.push(node);
    });
  const loc = node => `${model.fileOf(node)}:${node.pos}:${node.end}`;
  const references = createReferences(model, legacy);
  let current,
    busy = false;
  function build() {
    if (current) return current;
    if (busy) throw new Error('recursive dispatch construction');
    busy = true;
    let contexts = new Map(),
      previous,
      final,
      reasons = new Set(),
      cache = new Map();
    const escaped = new Set(),
      openFns = new Set();
    const memo = createDependencyMemo(escaped, node => model.declaration(node) ?? node);
    const resolver = createLocalInvocations(model, {
      isMutated: legacy.isMutated,
      isEscaped: memo.isEscaped,
      sourceReferences: references.resolve,
    });
    const effects = createInvocationEffects(model, resolver);
    const ancestors = new WeakMap(),
      contextKeys = new WeakMap(),
      canonicalCalls = new Map(),
      boundaryCalls = new Map();
    // Canonical, query-boundary, mutation and reference answers are build-invariant. reset()
    // discards every memo before mutation settlement changes them.
    function once(store, call, compute) {
      if (!store.has(call)) store.set(call, Boolean(compute()));
      return store.get(call);
    }
    const isCanonical = call => once(canonicalCalls, call, () => legacy.canonical(call.expression));
    const isBoundary = call =>
      once(boundaryCalls, call, () => legacy.queryBoundary?.(call.expression));
    // A frame token's bindings are immutable, so its key is memoized for the build. Any
    // bound/invalid reason ends the build after the round that raised it.
    function contextKey(context, seen = new Set()) {
      if (!context) return 'open';
      if (contextKeys.has(context)) return contextKeys.get(context);
      if (seen.has(context) || seen.size >= 64) {
        reasons.add('dispatch-context-bound');
        return 'bounded';
      }
      const bindings = resolver.bindingsFor(context);
      if (!bindings) {
        reasons.add('invalid-dispatch-context');
        return 'invalid';
      }
      seen = new Set(seen).add(context);
      const key = digest(
        JSON.stringify(
          bindings.map(item => [
            loc(item.parameter),
            loc(item.argument),
            contextKey(item.callerContext, seen),
          ])
        )
      );
      contextKeys.set(context, key);
      return key;
    }
    // Entries are keyed by the exact call node and the exact opaque frame token (or the open
    // frame). A different frame token never shares an entry, and a stale escape answer forces
    // recomputation. Only the previous round's generation is retained.
    function resolveEntry(call, context, generation) {
      const prior = cache.get(call)?.get(context);
      const entry =
        prior && memo.valid(prior.resolution)
          ? prior
          : {
              resolution: memo.record(() => resolver.resolveCall(call, context)),
              effects: prior?.effects,
            };
      const slots = generation.get(call) ?? new Map();
      slots.set(context, entry);
      generation.set(call, slots);
      return entry;
    }
    // Source-known calls and canonical query/callback boundaries are inspected separately;
    // only unresolved calls taint callable identities carried across an opaque boundary.
    function release(entry, call, context) {
      if (!memo.valid(entry.effects))
        entry.effects = memo.record(() => {
          const open = references.resolve(call.expression).functions;
          const escapes = [];
          if (!isBoundary(call))
            for (const arg of call.arguments) {
              const origin = effects.origins(arg, context);
              const found = (origin.functions ?? []).map(item => item.node);
              for (const item of origin.values) {
                const fn = model.declaration(item.node);
                if (fn && isFunction(fn)) found.push(fn);
              }
              for (const fn of found) {
                escaped.add(fn);
                escapes.push(fn);
              }
            }
          return { open, escapes };
        });
      for (const fn of entry.effects.value.open) openFns.add(fn);
      for (const fn of entry.effects.value.escapes) escaped.add(fn);
    }
    for (let round = 0; round < maxRounds; round++) {
      const byCall = new Map(),
        next = new Map(),
        callers = new Map(),
        generation = new Map();
      const budget = createDispatchBudget(maxEntries);
      reasons = new Set();
      function add(target) {
        budget.spend();
        const fn = target.functionNode;
        const ancestry = ancestors.get(target.callerContext) ?? [];
        const identity = `${loc(fn)}:${contextKey(target.definingContext)}`;
        if (ancestry.includes(identity)) return false;
        ancestors.set(target.context, [...ancestry, identity]);
        const key = JSON.stringify([loc(fn), loc(target.callNode), contextKey(target.context)]);
        const bucket = next.get(fn) ?? new Map();
        if (!bucket.has(key)) bucket.set(key, target);
        next.set(fn, bucket);
        const calls = callers.get(fn) ?? [];
        calls.push(target);
        callers.set(fn, calls);
        return true;
      }
      for (const call of callNodes) {
        const owner = ownerOf(call);
        const known = contexts.get(owner);
        const frames =
          known?.size && !escaped.has(owner)
            ? [...known.values()].map(item => item.context)
            : [undefined];
        if (openFns.has(owner) && !frames.includes(undefined)) frames.push(undefined);
        const canonical = isCanonical(call);
        const variants = [];
        for (const [index, context] of frames.entries()) {
          // The first frame is source traversal; every further frame is charged expansion.
          if (index > 0 && !budget.spend()) break;
          // Canonical callbacks are a separately authenticated boundary, not invocations of
          // the frozen helper implementation with its synthetic internal action({}) value.
          const entry = canonical ? undefined : resolveEntry(call, context, generation);
          const raw = entry
            ? entry.resolution.value
            : { functions: [], targets: [], unknown: true, reasons: ['canonical-boundary'] };
          const result = { ...raw, targets: [...raw.targets], reasons: [...raw.reasons] };
          for (const target of result.targets) {
            const intermediates = target.resolutionInvocations.map(add);
            if (!add(target) || intermediates.includes(false)) {
              result.unknown = true;
              result.reasons = [...result.reasons, 'recursive-dispatch-context'];
            }
          }
          if (result.unknown && entry) release(entry, call, context);
          variants.push({ ...result, callNode: call, context });
          if (budget.exhausted) break;
        }
        byCall.set(call, variants);
        if (budget.exhausted) {
          reasons.add('dispatch-entry-bound');
          break;
        }
      }
      cache = generation;
      const signature = JSON.stringify({
        contexts: [...next].map(([fn, values]) => [loc(fn), [...values.keys()].sort()]).sort(),
        openFns: [...openFns].map(loc).sort(),
        escaped: [...escaped].map(loc).sort(),
        reasons: [...reasons].sort(),
      });
      final = {
        resolver,
        effects,
        byCall,
        contexts: next,
        callers,
        escaped,
        openFns,
        reasons,
        settled: signature === previous && reasons.size === 0,
        budget: Object.freeze({
          sourceCalls: callNodes.length,
          maxEntries,
          expansion: budget.spent,
          rounds: round + 1,
        }),
      };
      if (final.settled || reasons.size) break;
      previous = signature;
      contexts = next;
    }
    if (!final.settled && !final.reasons.size) final.reasons.add('dispatch-round-bound');
    busy = false;
    current = final;
    return current;
  }
  function variants(call, context) {
    const state = build();
    if (state.reasons.size)
      return [
        {
          callNode: call,
          context,
          functions: [],
          targets: [],
          unknown: true,
          reasons: [...state.reasons],
        },
      ];
    return context === undefined
      ? (state.byCall.get(call) ?? [])
      : [{ ...state.resolver.resolveCall(call, context), callNode: call, context }];
  }
  return {
    variants,
    state: build,
    isBuilding: () => busy,
    reset: () => {
      current = undefined;
    },
    callsFor: fn => build().callers.get(fn) ?? [],
    bindingsFor: context => build().resolver.bindingsFor(context),
    contextsFor: fn => [...(build().contexts.get(fn)?.values() ?? [])],
  };
}
