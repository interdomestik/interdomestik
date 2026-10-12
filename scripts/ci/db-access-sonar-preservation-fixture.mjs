import ts from 'typescript';
import { createSourceModel } from './db-access-source.mjs';
import { createContextualProvenance } from './db-access-contextual.mjs';
import { createClientSymbols } from './db-access-client-symbols.mjs';
import { createDispatch } from './db-access-dispatch.mjs';
import { createInvocationEvidence } from './db-access-invocation-evidence.mjs';

// Test-only portable inputs for behavior-preserving refactor controls. Snapshots are normalized
// to source locations; no expected value is generated from candidate logic here.
export const FILE = 'apps/web/src/preservation.ts';
export const names = (count, prefix = 'a') =>
  Array.from({ length: count }, (_, index) => `${prefix}${index}`).join(',');

function finder(model) {
  return predicate => {
    let found;
    for (const sf of model.parsed.values())
      model.walk(sf, node => {
        if (!found && predicate(node)) found = node;
      });
    return found;
  };
}
const locator = model => node => node && `${model.fileOf(node)}:${node.pos}:${node.end}`;

// Contextual handles over stub legacy/dispatch answers; every legacy leaf call is recorded.
export function contextualFixture(source, leaf = () => false) {
  const model = createSourceModel(new Map([[FILE, source]]));
  const leaves = [];
  const legacy = {
    provenance: () => 'unknown',
    tenantHandle: node => {
      leaves.push(node.getText());
      return leaf(node.getText());
    },
    isMutated: () => false,
    canonical: () => false,
    queryBoundary: () => false,
  };
  const dispatch = {
    isBuilding: () => false,
    bindingsFor: () => undefined,
    callsFor: () => [],
    variants: () => [],
  };
  const find = finder(model);
  const initializer = name =>
    find(node => ts.isVariableDeclaration(node) && node.name.getText() === name).initializer;
  return {
    contextual: createContextualProvenance(model, legacy, dispatch),
    leaves,
    find,
    initializer,
  };
}

export function clientFixture(source) {
  const model = createSourceModel(
    new Map([
      [
        'packages/database/package.json',
        JSON.stringify({ name: '@interdomestik/database', exports: { '.': './src/db.ts' } }),
      ],
      ['packages/database/src/db.ts', 'export const db = {} as any;'],
      [FILE, source],
    ])
  );
  return { symbols: createClientSymbols(model, new Set()), find: finder(model) };
}

export const DISPATCH_SOURCES = {
  'mixed-callers':
    'function read(x){return x.select();} function forward(y){return read(y);} const a={select(){return 1;}}; const b={select(){return 2;}}; forward(a); read(b);',
  'factory-intermediate': 'function make(){return {run(){return 1;}};} make().run();',
  'escape-late':
    'declare function later(fn: unknown): void; function read(x){return x.select();} const a={select(){}}; read(a); later(read);',
};

const bindingPairs = (bindings, loc) =>
  [...bindings].map(([parameter, argument]) => [loc(parameter), loc(argument)]);
const invocationFields = (item, loc) => ({
  function: loc(item.functionNode),
  call: loc(item.callNode),
  own: bindingPairs(item.argumentBindings, loc),
  captured: bindingPairs(item.closureBindings, loc),
});

// Two distinct API schemas. A resolution intermediary is a plain invocation descriptor and never
// carries resolutionInvocations; a resolved target must carry its own array. Neither serializer
// normalizes the other schema, so a malformed target or a confused descriptor throws.
export function describePlainInvocation(item, loc) {
  if (Object.hasOwn(item, 'resolutionInvocations'))
    throw new TypeError('plain invocation descriptor must not carry resolutionInvocations');
  return invocationFields(item, loc);
}

export function describeResolvedTarget(item, loc) {
  if (!Array.isArray(item.resolutionInvocations))
    throw new TypeError('resolved target must carry resolutionInvocations');
  return {
    ...invocationFields(item, loc),
    intermediates: item.resolutionInvocations.map(inner => describePlainInvocation(inner, loc)),
  };
}

// state.callers holds both kinds: dispatch registers each intermediary before its target. Kind is
// decided by object identity against the same round's byCall targets, never by sniffing fields.
function schemaSets(state) {
  const targets = new Set();
  const intermediaries = new Set();
  for (const variants of state.byCall.values())
    for (const variant of variants)
      for (const target of variant.targets) {
        if (!Array.isArray(target.resolutionInvocations))
          throw new TypeError('resolved target must carry resolutionInvocations');
        targets.add(target);
        for (const inner of target.resolutionInvocations) intermediaries.add(inner);
      }
  return { targets, intermediaries };
}

export function dispatchSnapshot(source, { reset = false } = {}) {
  const model = createSourceModel(new Map([[FILE, source]]));
  const dispatch = createDispatch(model, { isMutated: () => false, canonical: () => false });
  if (reset) {
    dispatch.state();
    dispatch.reset();
  }
  const state = dispatch.state();
  const loc = locator(model);
  const { targets, intermediaries } = schemaSets(state);
  const target = item => describeResolvedTarget(item, loc);
  const caller = item => {
    if (targets.has(item)) return { kind: 'target', ...target(item) };
    if (intermediaries.has(item))
      return { kind: 'intermediary', ...describePlainInvocation(item, loc) };
    throw new TypeError('caller is neither a resolved target nor a resolution intermediary');
  };
  return {
    settled: state.settled,
    reasons: [...state.reasons],
    budget: { ...state.budget },
    frozenBudget: Object.isFrozen(state.budget),
    byCall: [...state.byCall].map(([call, variants]) => [
      loc(call),
      variants.map(item => [item.unknown, [...item.reasons], item.targets.map(target)]),
    ]),
    contexts: [...state.contexts].map(([fn, values]) => [loc(fn), [...values.keys()]]),
    callerNames: [...state.callers.keys()].map(fn => fn.name?.getText() ?? loc(fn)),
    callers: [...state.callers].map(([fn, list]) => [loc(fn), list.map(caller)]),
    escaped: [...state.escaped].map(loc),
    open: [...state.openFns].map(loc),
  };
}

export const EVIDENCE_SOURCE = 'function id(x: unknown) { return x; } id(id)(1);';

export function evidenceFixture(source, rootTexts) {
  const model = createSourceModel(new Map([[FILE, source]]));
  const find = finder(model);
  const roots = rootTexts.map(text => ({
    call: find(node => ts.isCallExpression(node) && node.getText() === text),
  }));
  const evidence = createInvocationEvidence(model).analyze(roots);
  const loc = locator(model);
  const pass = item => ({
    calls: item.calls.map(call => [
      call.path,
      call.unknown,
      [...call.reasons],
      call.targets.map(target => [
        loc(target.functionNode),
        target.resolutionInvocations.map(inner => loc(inner.callNode)),
      ]),
    ]),
    effects: item.effects.map(effect => [
      effect.kind,
      effect.path,
      loc(effect.node),
      effect.origins.map(origin => loc(origin.node)),
      [...effect.unknown],
    ]),
    unresolved: item.unresolved.map(entry => [entry.path, [...entry.reasons]]),
  });
  return {
    evidence,
    find,
    snapshot: {
      settled: evidence.settled,
      reasons: [...evidence.reasons],
      passes: evidence.passes.map(pass),
    },
  };
}
