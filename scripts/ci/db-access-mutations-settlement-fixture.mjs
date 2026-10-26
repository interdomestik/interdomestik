import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createSourceModel } from './db-access-source.mjs';
import { ORIGINAL_FINISH } from './db-access-mutations-settlement-reference.mjs';

// Test-only harness: production modules are read, instrumented in memory and imported from data
// URLs. No repository file is written and no production module carries instrumentation.
const moduleRoot = new URL('./', import.meta.url);
const typescriptUrl = pathToFileURL(createRequire(import.meta.url).resolve('typescript')).href;
const probeKey = Symbol.for('interdomestik.db-access.settlement-probe');
const PROBE = `globalThis[Symbol.for('interdomestik.db-access.settlement-probe')]`;
const SIZES = '[mutations.size, unsafeMutations.size]';
const read = file => fs.readFileSync(new URL(file, moduleRoot), 'utf8');

export function replaceOnce(text, from, to) {
  assert.equal(text.split(from).length, 2, `exactly one anchor: ${from}`);
  return text.replace(from, () => to);
}

const FINISH = '  function finish(provenance) {';
const BOUND = `analysisUnknown.add('mutation-dispatch-settlement-bound');`;

function finishRange(text) {
  assert.equal(text.split(FINISH).length, 2, 'one finish');
  assert.equal(text.split(BOUND).length, 2, 'one settlement bound');
  const start = text.indexOf(FINISH);
  const bound = text.indexOf(BOUND) + BOUND.length;
  const end = text.indexOf('  }', bound) + 3;
  assert.ok(start >= 0 && bound > start, 'finish anchors');
  assert.equal(text.slice(bound, end).trim(), '}', 'finish closes after the bound');
  return [start, end];
}
assert.deepEqual(finishRange(ORIGINAL_FINISH), [0, ORIGINAL_FINISH.length]);

// The reference is the current module with only finish replaced by the frozen original.
export function moduleTexts() {
  const candidate = read('db-access-mutations.mjs');
  const [start, end] = finishRange(candidate);
  return {
    candidate,
    reference: candidate.slice(0, start) + ORIGINAL_FINISH + candidate.slice(end),
  };
}

// Counters only: per invocation (null marker) and per round sizes, resets and opaque sweeps.
function instrument(text) {
  return [
    ['let previous;', `${PROBE}.push(null); let previous;`],
    [
      'for (let round = 0; round < 32; round++) {',
      `for (let round = 0; round < 32; round++) { const probe = { start: ${SIZES}, resets: 0, sweeps: 0 }; ${PROBE}.push(probe);`,
    ],
    ['provenance.dispatch?.reset();', 'probe.resets++; provenance.dispatch?.reset();'],
    ['previous = signature;', 'previous = signature; probe.passed = true;'],
    ['for (const node of opaqueCalls) {', 'probe.sweeps++; for (const node of opaqueCalls) {'],
    [
      text.includes('for (const node of propagationSyntax)')
        ? '      for (const node of propagationSyntax)'
        : '      for (const sf of model.parsed.values())',
      text.includes('for (const node of propagationSyntax)')
        ? `      probe.afterOpaque = ${SIZES}; for (const node of propagationSyntax)`
        : `      probe.afterOpaque = ${SIZES}; for (const sf of model.parsed.values())`,
    ],
    ['if (beforeMutations ===', `probe.end = ${SIZES}; if (beforeMutations ===`],
  ].reduce((result, [from, to]) => replaceOnce(result, from, to), text);
}

const FINISH_CALL = '  finish(result);';
const TRANSFORMS = {
  once: text => text,
  twice: text => replaceOnce(text, FINISH_CALL, `${FINISH_CALL} finish(result);`),
  absent: text => replaceOnce(text, FINISH_CALL, '  finish({ ...result, dispatch: undefined });'),
  // Every dispatch read after the first through the injected facade throws; a clean retry follows.
  interrupted: text =>
    replaceOnce(
      text,
      FINISH_CALL,
      `  let settlementReads = 0;
  const settlementFailing = { ...result, dispatch: { ...dispatch, state: () => {
    if (++settlementReads >= 2) throw new Error('injected dispatch read failure');
    return dispatch.state();
  } } };
  try { finish(settlementFailing); } catch (error) {
    ${PROBE}.push({ interruption: error.message, sizes: ${SIZES} });
  }
  finish(result);`
    ),
};

const encode = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const link = text =>
  text
    .replaceAll(`from 'typescript'`, () => `from '${typescriptUrl}'`)
    .replace(/from '\.\/([^']+)'/gu, (_, file) => `from '${new URL(file, moduleRoot).href}'`);
const loaded = new Map();

export function load(kind, transform = 'once') {
  assert.ok(['reference', 'candidate'].includes(kind) && transform in TRANSFORMS);
  const key = `${kind}:${transform}`;
  if (!loaded.has(key)) {
    const mutationsUrl = encode(link(instrument(moduleTexts()[kind])));
    const provenance = replaceOnce(
      read('db-access-provenance.mjs'),
      `from './db-access-mutations.mjs'`,
      `from '${mutationsUrl}'`
    );
    const url = encode(link(TRANSFORMS[transform](provenance)));
    loaded.set(
      key,
      import(url).then(module => module.createProvenance)
    );
  }
  return loaded.get(key);
}

function group(stream) {
  const invocations = [],
    interruptions = [];
  for (const item of stream) {
    if (item === null) invocations.push([]);
    else if ('interruption' in item) interruptions.push(item);
    else invocations.at(-1).push(item);
  }
  return { invocations, interruptions };
}

export function observe(createProvenance, sources) {
  const model = createSourceModel(new Map(Object.entries(sources)));
  const stream = [];
  globalThis[probeKey] = stream;
  try {
    const result = createProvenance(model);
    return { result, snapshot: snapshot(model, result), ...group(stream) };
  } finally {
    delete globalThis[probeKey];
  }
}

export const progress = rounds =>
  rounds.map(round => [round.start, round.afterOpaque ?? null, round.end ?? null]);
export const schedule = rounds => rounds.map(round => [round.resets, round.sweeps]);
export const counts = rounds => ({
  rounds: rounds.length,
  resets: rounds.reduce((total, round) => total + round.resets, 0),
  sweeps: rounds.reduce((total, round) => total + round.sweeps, 0),
});

// Specification oracle over a frozen-reference progression: rebuild initially and whenever the
// mutations generation changed; reuse a sweep only if it completed for the same generation after
// the latest rebuild without adding mutations. An interrupted sweep is never completed.
export function expectedSchedule(rounds) {
  let generation, completed;
  return rounds.map(({ start, passed, afterOpaque }) => {
    const reset = generation !== start[0];
    if (reset) {
      generation = start[0];
      completed = undefined;
    }
    const sweep = passed === true && completed !== start[0];
    if (sweep) completed = afterOpaque?.[0] === start[0] ? start[0] : undefined;
    return [Number(reset), Number(sweep)];
  });
}

// Symbol names are strings; this local comparator is the default code-unit order.
export const sortedNames = values =>
  [...values].map(symbol => ts.symbolName(symbol)).sort((a, b) => Number(a > b) - Number(a < b));

// Ordered evidence: mutations, strictness, environment, unknowns, dispatch alternatives, callers,
// contexts, argument/closure bindings and resolution intermediaries.
export function snapshot(model, result) {
  const loc = node => node && `${model.fileOf(node)}:${node.pos}:${node.end}`;
  const symbols = values => [...values].map(symbol => symbol.declarations?.map(loc));
  const state = result.dispatch.state();
  function frame(context, depth = 0) {
    if (!context) return null;
    if (depth === 64) return 'bound';
    return state.resolver
      .bindingsFor(context)
      ?.map(item => [
        loc(item.parameter),
        loc(item.argument),
        frame(item.callerContext, depth + 1),
      ]);
  }
  const pairs = map => [...map].map(([key, value]) => [loc(key), loc(value)]);
  const target = item => [
    loc(item.functionNode),
    loc(item.callNode),
    loc(item.receiverNode),
    pairs(item.argumentBindings),
    pairs(item.closureBindings),
    frame(item.context),
    frame(item.callerContext),
    frame(item.definingContext),
  ];
  return {
    mutations: symbols(result.mutations),
    unsafeMutations: symbols(result.unsafeMutations),
    environment: [...result.environmentChanges],
    analysisUnknown: [...result.analysisUnknown],
    escaped: [...state.escaped].map(loc),
    open: [...state.openFns].map(loc),
    reasons: [...state.reasons],
    byCall: [...state.byCall].map(([call, alternatives]) => [
      loc(call),
      alternatives.map(item => [
        item.unknown,
        item.reasons,
        item.functions.map(loc),
        frame(item.context),
        item.targets.map(entry => [target(entry), entry.resolutionInvocations.map(target)]),
      ]),
    ]),
    callers: [...state.callers].map(([fn, list]) => [loc(fn), list.map(target)]),
    budget: state.budget,
  };
}

export function chain(length, strict) {
  return (
    Array.from({ length }, (_, index) => length - index)
      .map(i => `function f${i}(p${i}) { opaque(p${i}); f${i - 1}(p${i}); }`)
      .join('\n') +
    `\nfunction f0(p0) { ${strict ? 'p0.flag = true;' : 'opaque(p0);'} }\nconst root = {}; f${length}(root);`
  );
}

const FILE = 'apps/web/src/probe.ts';
export const CASES = [
  ['reverse-strict-6', { [FILE]: chain(6, true) }],
  ['reverse-unstrict-6', { [FILE]: chain(6, false) }],
  ['reverse-strict-34-dispatch-bound', { [FILE]: chain(34, true) }],
  [
    'reverse-strict-40-settlement-bound',
    { [FILE]: chain(40, true).replace(/f(\d+)\((p\d+|root)\);/gu, 'f$1($2, 0);') },
  ],
  [
    'late-mutation-after-stable-opaque',
    { [FILE]: chain(6, false).replaceAll(/opaque\(p[1-9]\d*\); /gu, '') },
  ],
  [
    'alias-mutation-growth',
    { [FILE]: 'const a = {}; const b = a; const c = b; const d = c; opaque(d);' },
  ],
  [
    'factory-late-escape',
    {
      [FILE]:
        'function factory(x) { return () => x; } const fn = factory({}); function wrapper(x) { opaque(x); } wrapper(fn); fn();',
    },
  ],
  ['recursive-unknown', { [FILE]: 'function f(x) { opaque(x); return f(x); } f({});' }],
];
