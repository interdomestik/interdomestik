import ts from 'typescript';
import { createLocalInvocations } from './db-access-invocations.mjs';
import {
  createInvocationEffects,
  walkOwned,
  writtenValue,
} from './db-access-invocation-effects.mjs';
import { unwrap } from './db-access-source.mjs';

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
    const rootOf = raw => {
      let node = unwrap(raw);
      while (node && (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)))
        node = unwrap(node.expression);
      return node;
    };
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
    for (let round = 0; round < maxRounds; round++) {
      const resolver = createLocalInvocations(model, {
        isMutated: node => marked(mutations, node),
        isEscaped: node => marked(escapes, node),
      });
      const effects = createInvocationEffects(model, resolver);
      const queue = roots.map((root, index) => ({ ...root, path: `root:${index}`, ancestors: [] }));
      const calls = [],
        records = [],
        unresolved = [],
        visited = new Set();
      const pendingMutations = [],
        pendingEscapes = [];
      function record(kind, node, context, path) {
        const origin = effects.origins(node, context);
        records.push({
          kind,
          node,
          context,
          path,
          origins: origin.values,
          unknown: origin.unknown,
        });
        if (kind === 'write') pendingMutations.push(...origin.values.map(item => item.node));
        if (kind === 'opaque-argument')
          pendingEscapes.push(...origin.values.map(item => item.node));
      }
      function enqueueBody(target, path, ancestors) {
        const identity = { fn: target.functionNode, defining: target.definingContext };
        if (
          ancestors.some(item => item.fn === identity.fn && item.defining === identity.defining)
        ) {
          unresolved.push({ path, call: target.callNode, reasons: ['recursive-evidence'] });
          return;
        }
        const next = [...ancestors, identity];
        walkOwned(target.functionNode.body, node => {
          const key = `${path}/${location(node)}`;
          if (ts.isCallExpression(node))
            queue.push({ call: node, context: target.context, path: key, ancestors: next });
          const write = writtenValue(node);
          if (write) record('write', write, target.context, key);
          if (ts.isReturnStatement(node) && node.expression)
            record('return', node.expression, target.context, key);
          if (
            ts.isArrowFunction(target.functionNode) &&
            node === target.functionNode.body &&
            !ts.isBlock(node)
          )
            record('return', node, target.context, key);
          if (
            ts.isVariableDeclaration(node) &&
            node.initializer &&
            ts.isObjectLiteralExpression(unwrap(node.initializer))
          )
            record('local-containment', node.initializer, target.context, key);
        });
      }
      while (queue.length) {
        if (calls.length >= maxEntries) {
          exhausted = true;
          break;
        }
        const entry = queue.shift();
        if (visited.has(entry.path)) continue;
        visited.add(entry.path);
        const result = resolver.resolveCall(entry.call, entry.context);
        calls.push({ ...entry, ...result });
        if (result.unknown) {
          unresolved.push({ path: entry.path, call: entry.call, reasons: result.reasons });
          for (const argument of entry.call?.arguments ?? [])
            record('opaque-argument', argument, entry.context, entry.path);
        }
        for (const target of result.targets) {
          for (const [index, intermediate] of target.resolutionInvocations.entries())
            enqueueBody(intermediate, `${entry.path}/intermediate:${index}`, entry.ancestors);
          enqueueBody(target, `${entry.path}/target`, entry.ancestors);
        }
      }
      // Resolve known local callees before propagating conservative opaque effects. These new
      // facts are separate from legacy finish()/mutations and cannot affect current decisions.
      pendingMutations.forEach(node => mark(mutations, node));
      pendingEscapes.forEach(node => mark(escapes, node));
      const signature = JSON.stringify({
        calls: calls.map(item => [
          item.path,
          item.unknown,
          item.reasons,
          item.targets.map(target => ({
            function: location(target.functionNode),
            call: location(target.callNode),
            own: [...target.argumentBindings].map(([parameter, argument]) => [
              location(parameter),
              location(argument),
            ]),
            captured: [...target.closureBindings].map(([parameter, argument]) => [
              location(parameter),
              location(argument),
            ]),
            intermediates: target.resolutionInvocations.map(invocation => [
              location(invocation.functionNode),
              location(invocation.callNode),
              [...invocation.argumentBindings].map(([parameter, argument]) => [
                location(parameter),
                location(argument),
              ]),
              [...invocation.closureBindings].map(([parameter, argument]) => [
                location(parameter),
                location(argument),
              ]),
            ]),
          })),
        ]),
        effects: records.map(item => [
          item.kind,
          item.path,
          location(item.node),
          item.origins.map(origin => location(origin.node)),
          item.unknown,
        ]),
        unresolved: unresolved.map(item => [item.path, item.reasons]),
        markReasons: [...markReasons],
        mutations: [...mutations].map(symbol => symbol.declarations?.map(location)).sort(),
        escapes: [...escapes].map(symbol => symbol.declarations?.map(location)).sort(),
      });
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
      passes.push(
        Object.freeze({
          calls: Object.freeze(calls),
          effects: Object.freeze(records),
          unresolved: Object.freeze(unresolved),
        })
      );
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
      callsFor: fn =>
        Object.freeze(
          passes.flatMap(pass =>
            pass.calls.flatMap(call =>
              call.targets.flatMap(target =>
                [...target.resolutionInvocations, target].filter(item => item.functionNode === fn)
              )
            )
          )
        ),
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
