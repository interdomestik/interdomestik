import ts from 'typescript';
import { createLocalInvocations } from './db-access-invocations.mjs';
import {
  createInvocationEffects,
  walkOwned,
  writtenValue,
} from './db-access-invocation-effects.mjs';
import { compareCodeUnits } from './db-access-order.mjs';
import { unwrap } from './db-access-source.mjs';

function rootOf(raw) {
  let node = unwrap(raw);
  while (node && (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)))
    node = unwrap(node.expression);
  return node;
}

// Symbol marks shared by every round of one analysis; alias chains are bounded at 64.
function createMarks(model, markReasons) {
  const marked = (set, node) => set.has(model.symbol(rootOf(node)));
  const mark = (set, raw, seen = new Set()) => {
    const node = rootOf(raw);
    if (!node || seen.has(node)) return;
    if (seen.size >= 64) {
      markReasons.add('evidence-alias-budget');
      return;
    }
    seen = new Set(seen).add(node);
    const symbol = model.symbol(node);
    if (symbol) set.add(symbol);
    const decl = model.declaration(node);
    if (decl && ts.isVariableDeclaration(decl) && decl.initializer)
      mark(set, decl.initializer, seen);
  };
  return { marked, mark };
}

// One resolver/effects pass: round = { resolver, effects, location, queue, visited, calls,
// records, unresolved, pendingMutations, pendingEscapes }. Origins run before the record push;
// pending pushes follow in record order.
function recordEffect(round, kind, node, context, path) {
  const origin = round.effects.origins(node, context);
  round.records.push({
    kind,
    node,
    context,
    path,
    origins: origin.values,
    unknown: origin.unknown,
  });
  if (kind === 'write') round.pendingMutations.push(...origin.values.map(item => item.node));
  if (kind === 'opaque-argument')
    round.pendingEscapes.push(...origin.values.map(item => item.node));
}

function recordOwned(round, target, node, key, ancestors) {
  if (ts.isCallExpression(node))
    round.queue.push({ call: node, context: target.context, path: key, ancestors });
  const write = writtenValue(node);
  if (write) recordEffect(round, 'write', write, target.context, key);
  if (ts.isReturnStatement(node) && node.expression)
    recordEffect(round, 'return', node.expression, target.context, key);
  if (
    ts.isArrowFunction(target.functionNode) &&
    node === target.functionNode.body &&
    !ts.isBlock(node)
  )
    recordEffect(round, 'return', node, target.context, key);
  if (
    ts.isVariableDeclaration(node) &&
    node.initializer &&
    ts.isObjectLiteralExpression(unwrap(node.initializer))
  )
    recordEffect(round, 'local-containment', node.initializer, target.context, key);
}

function enqueueBody(round, target, path, ancestors) {
  const identity = { fn: target.functionNode, defining: target.definingContext };
  if (ancestors.some(item => item.fn === identity.fn && item.defining === identity.defining)) {
    round.unresolved.push({ path, call: target.callNode, reasons: ['recursive-evidence'] });
    return;
  }
  const next = [...ancestors, identity];
  walkOwned(target.functionNode.body, node =>
    recordOwned(round, target, node, `${path}/${round.location(node)}`, next)
  );
}

// Returns true when the entry budget is exhausted. The budget is checked before dequeue and
// before the visited skip; intermediaries are enqueued before their target.
function drainQueue(round, maxEntries) {
  while (round.queue.length) {
    if (round.calls.length >= maxEntries) return true;
    const entry = round.queue.shift();
    if (round.visited.has(entry.path)) continue;
    round.visited.add(entry.path);
    const result = round.resolver.resolveCall(entry.call, entry.context);
    round.calls.push({ ...entry, ...result });
    if (result.unknown) {
      round.unresolved.push({ path: entry.path, call: entry.call, reasons: result.reasons });
      for (const argument of entry.call?.arguments ?? [])
        recordEffect(round, 'opaque-argument', argument, entry.context, entry.path);
    }
    for (const target of result.targets) {
      for (const [index, intermediate] of target.resolutionInvocations.entries())
        enqueueBody(round, intermediate, `${entry.path}/intermediate:${index}`, entry.ancestors);
      enqueueBody(round, target, `${entry.path}/target`, entry.ancestors);
    }
  }
  return false;
}

const bindingPairs = (bindings, location) =>
  [...bindings].map(([parameter, argument]) => [location(parameter), location(argument)]);

function invocationSignature(invocation, location) {
  return [
    location(invocation.functionNode),
    location(invocation.callNode),
    bindingPairs(invocation.argumentBindings, location),
    bindingPairs(invocation.closureBindings, location),
  ];
}

function targetSignature(target, location) {
  return {
    function: location(target.functionNode),
    call: location(target.callNode),
    own: bindingPairs(target.argumentBindings, location),
    captured: bindingPairs(target.closureBindings, location),
    intermediates: target.resolutionInvocations.map(item => invocationSignature(item, location)),
  };
}

function callSignature(item, location) {
  return [
    item.path,
    item.unknown,
    item.reasons,
    item.targets.map(target => targetSignature(target, location)),
  ];
}

// compareCodeUnits is the default order spelled explicitly: location arrays compare as
// comma-joined strings and undefined declarations stay last.
function roundSignature(round, markReasons, mutations, escapes) {
  const { location } = round;
  return JSON.stringify({
    calls: round.calls.map(item => callSignature(item, location)),
    effects: round.records.map(item => [
      item.kind,
      item.path,
      location(item.node),
      item.origins.map(origin => location(origin.node)),
      item.unknown,
    ]),
    unresolved: round.unresolved.map(item => [item.path, item.reasons]),
    markReasons: [...markReasons],
    mutations: [...mutations]
      .map(symbol => symbol.declarations?.map(location))
      .sort(compareCodeUnits),
    escapes: [...escapes].map(symbol => symbol.declarations?.map(location)).sort(compareCodeUnits),
  });
}

function freezeRound({ calls, records, unresolved }) {
  for (const entry of calls) {
    Object.freeze(entry.functions);
    Object.freeze(entry.reasons);
    for (const target of entry.targets) {
      Object.freeze(target.resolutionInvocations);
      Object.freeze(target);
    }
    Object.freeze(entry.targets);
    Object.freeze(entry.ancestors);
    Object.freeze(entry);
  }
  for (const record of records) {
    record.origins.forEach(Object.freeze);
    Object.freeze(record.origins);
    Object.freeze(record.unknown);
    Object.freeze(record);
  }
  for (const entry of unresolved) {
    Object.freeze(entry.reasons);
    Object.freeze(entry);
  }
  return Object.freeze({
    calls: Object.freeze(calls),
    effects: Object.freeze(records),
    unresolved: Object.freeze(unresolved),
  });
}

const ownInvocations = (target, fn) =>
  [...target.resolutionInvocations, target].filter(item => item.functionNode === fn);
const callTargets = (call, fn) => call.targets.flatMap(target => ownInvocations(target, fn));
// Pass order, then call order, then intermediaries before each target.
function callsForFunction(passes, fn) {
  return passes.flatMap(pass => pass.calls.flatMap(call => callTargets(call, fn)));
}

// Additive preparation only. Callers MUST supply their actual authoritative executable roots.
// No source filename, unbound local template, library or absence of callers grants an exemption.
export function createInvocationEvidence(model) {
  const location = node => `${model.fileOf(node)}:${node.pos}:${node.end}`;
  function analyze(roots, { maxEntries = 512, maxRounds = 8 } = {}) {
    if (
      !Array.isArray(roots) ||
      !Number.isInteger(maxEntries) ||
      maxEntries < 1 ||
      !Number.isInteger(maxRounds) ||
      maxRounds < 1
    )
      throw new TypeError('Invalid evidence bounds/roots');
    const mutations = new Set(),
      escapes = new Set(),
      syntaxSeeds = [],
      markReasons = new Set();
    const { marked, mark } = createMarks(model, markReasons);
    for (const sf of model.parsed.values())
      model.walk(sf, node => {
        const value = writtenValue(node);
        if (value) {
          syntaxSeeds.push({ node, value });
          mark(mutations, value);
        }
      });
    let previous,
      settled = false,
      exhausted = false;
    const passes = [];
    for (let index = 0; index < maxRounds; index++) {
      const resolver = createLocalInvocations(model, {
        isMutated: node => marked(mutations, node),
        isEscaped: node => marked(escapes, node),
      });
      const round = {
        resolver,
        effects: createInvocationEffects(model, resolver),
        location,
        queue: roots.map((root, rootIndex) => ({
          ...root,
          path: `root:${rootIndex}`,
          ancestors: [],
        })),
        calls: [],
        records: [],
        unresolved: [],
        visited: new Set(),
        pendingMutations: [],
        pendingEscapes: [],
      };
      exhausted = drainQueue(round, maxEntries);
      // Resolve known local callees before propagating conservative opaque effects. These new
      // facts are separate from legacy finish()/mutations and cannot affect current decisions.
      round.pendingMutations.forEach(node => mark(mutations, node));
      round.pendingEscapes.forEach(node => mark(escapes, node));
      const signature = roundSignature(round, markReasons, mutations, escapes);
      passes.push(freezeRound(round));
      if (signature === previous && !exhausted) {
        settled = true;
        break;
      }
      previous = signature;
      if (exhausted) break;
    }
    const final = passes.at(-1);
    const reasons = [
      ...new Set([...final.unresolved.flatMap(item => item.reasons), ...markReasons]),
    ];
    if (!settled) reasons.push(exhausted ? 'evidence-entry-budget' : 'evidence-round-budget');
    if (final.effects.some(item => item.unknown.length)) reasons.push('unresolved-effect');
    return Object.freeze({
      calls: final.calls,
      effects: final.effects,
      unresolved: final.unresolved,
      passes: Object.freeze(passes),
      syntaxSeeds: Object.freeze(syntaxSeeds.map(Object.freeze)),
      settled,
      scope: 'supplied-roots-only',
      rootCount: roots.length,
      unknown: reasons.length > 0,
      reasons: Object.freeze(reasons),
      callsFor: fn => Object.freeze(callsForFunction(passes, fn)),
    });
  }
  return Object.freeze({ analyze });
}

// Keep lazy attachment cohesive with the additive adapter. Existing provenance fields and
// finish() retain their exact implementations and references.
export function withInvocationEvidence(legacy, model) {
  let evidence;
  return Object.defineProperty(legacy, 'invocationEvidence', {
    enumerable: false,
    get: () => (evidence ??= createInvocationEvidence(model)),
  });
}
