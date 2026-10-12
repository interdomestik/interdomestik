import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { replaceOnce, snapshot } from './db-access-mutations-settlement-fixture.mjs';
import { createSourceModel } from './db-access-source.mjs';

// Test-only harness. Production modules are read and linked into in-memory data URLs; the private
// invalidate/externalOrigin/lookup callbacks exist only in those transformed copies, so production
// gains no testing API. The reference is the frozen pre-optimization module and is never derived
// from the candidate. Counters observe model calls only; nothing here asserts wall-clock time.
const moduleRoot = new URL('./', import.meta.url);
const typescriptUrl = pathToFileURL(createRequire(import.meta.url).resolve('typescript')).href;
const PROBE_KEY = Symbol.for('interdomestik.db-access.static-probe');
const PROBE = `globalThis[Symbol.for('interdomestik.db-access.static-probe')]`;
const MODULES = {
  reference: 'db-access-mutations-static-reference.mjs',
  candidate: 'db-access-mutations.mjs',
};
const COUNTED = [
  ['symbol', 'symbols'],
  ['fileOf', 'files'],
  ['declaration', 'declarations'],
  ['isQueryOperator', 'queryOperators'],
];
const MANIFEST = [
  'apps/web/package.json',
  JSON.stringify({ name: '@probe/web', dependencies: { 'drizzle-orm': '1' } }),
];
export const FILE = 'apps/web/src/probe.ts';

const IMPORTS = [
  "import {eq as importedEq} from 'drizzle-orm';",
  "import * as orm from 'drizzle-orm';",
  "import {eq as foreignEq} from 'other-lib';",
  'const direct=importedEq; const alias=importedEq; const indirect=alias;',
  'const property=importedEq.call; const namespace=orm.eq; const foreign=foreignEq;',
  'const unresolved=missing;',
  'function shadow(importedEq) { const hidden=importedEq; return hidden; }',
].join(' ');
const ORIGIN = [
  "import {eq} from 'drizzle-orm';",
  ...Array.from({ length: 72 }, (_, i) => {
    const previous = i ? `a${i - 1}` : 'eq';
    return `const a${i} = ${previous};`;
  }),
  'const cycleA=cycleB;const cycleB=cycleA;const missing=42;',
].join('\n');

// Control sources shared with the persistent test; the test owns every expectation.
export const SOURCES = {
  tree: 'const a = {}; const b = {}; const spread = {}; const tree = [a, {a, value: b, ...spread}, ...[b]];',
  imports: IMPORTS,
  origin: ORIGIN,
  vendor: [
    [
      'apps/web/src/vendor.ts',
      "declare module 'drizzle-orm' { export function eq(...args: any[]): any; }",
    ],
  ],
  record: "const record = {}; const prop = (record as any)!.x; const index = record['y'];",
  shadow: 'const item = {}; function f() { const item = {}; }',
  items: 'const item = {}; function f() { const item = {}; } const literal=42;',
  ambient: 'const local = {}; const ambient = missing;',
  local: 'const local = {};',
  fn: 'function fn() { return 1; }',
  env: 'const env = globalThis; const data = env.settings;',
};

const read = file => fs.readFileSync(new URL(file, moduleRoot), 'utf8');
const encode = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const link = text =>
  text
    .replaceAll(`from 'typescript'`, () => `from '${typescriptUrl}'`)
    .replace(/from '\.\/([^']+)'/gu, (_, file) => `from '${new URL(file, moduleRoot).href}'`);

// Counters plus an in-memory hook. The candidate exposes its helper aliases; the reference falls
// back to the model methods those helpers replace.
function instrument(text, candidate) {
  const trace = candidate ? 'traceExternalOrigin' : 'externalOrigin';
  const declaration = candidate ? 'sourceDeclaration' : 'node => model.declaration(node)';
  const queryOperator = candidate ? 'sourceQueryOperator' : 'node => model.isQueryOperator(node)';
  const hooks = `__test: { invalidate, externalOrigin, changed, declaration: ${declaration}, queryOperator: ${queryOperator} },`;
  return [
    [
      '    if (globalRoot(node) && changed(node))',
      `    ${PROBE}.invalidations++;\n    if (globalRoot(node) && changed(node))`,
    ],
    [
      `  function ${trace}(raw, seen = new Set()) {`,
      `  function ${trace}(raw, seen = new Set()) {\n    ${PROBE}.traces++;`,
    ],
    ['  return {\n    analysisUnknown,', `  return {\n    ${hooks}\n    analysisUnknown,`],
  ].reduce((result, [from, to]) => replaceOnce(result, from, to), text);
}

const loaded = new Map();
export function load(kind) {
  assert.ok(kind in MODULES, `known implementation: ${kind}`);
  if (!loaded.has(kind)) {
    const mutationsUrl = encode(link(instrument(read(MODULES[kind]), kind === 'candidate')));
    const provenance = replaceOnce(
      read('db-access-provenance.mjs'),
      `from './db-access-mutations.mjs'`,
      `from '${mutationsUrl}'`
    );
    loaded.set(
      kind,
      Promise.all([import(mutationsUrl), import(encode(link(provenance)))]).then(
        ([mutations, module]) => ({
          collectMutationEffects: mutations.collectMutationEffects,
          createProvenance: module.createProvenance,
        })
      )
    );
  }
  return loaded.get(kind);
}

const createProbe = () => ({
  invalidations: 0,
  traces: 0,
  symbols: 0,
  files: 0,
  declarations: 0,
  queryOperators: 0,
});

function countedModel(sources, approved, probe) {
  const model = createSourceModel(sources, approved);
  for (const [method, counter] of COUNTED) {
    const original = model[method];
    model[method] = node => {
      probe[counter]++;
      return original(node);
    };
  }
  return model;
}

export const makeModel = (source, approved = source, extra = [], probe = createProbe()) =>
  countedModel(
    new Map([MANIFEST, [FILE, source], ...extra]),
    new Map([MANIFEST, [FILE, approved], ...extra]),
    probe
  );

function observing(run) {
  const probe = createProbe();
  globalThis[PROBE_KEY] = probe;
  try {
    return run(probe);
  } finally {
    delete globalThis[PROBE_KEY];
  }
}

// Ordered mutation, strictness, environment and unknown evidence for one collection.
export function sets(model, result) {
  const loc = node => node && `${model.fileOf(node)}:${node.pos}:${node.end}`;
  const symbols = values => [...values].map(symbol => symbol.declarations?.map(loc));
  return {
    mutations: symbols(result.mutations),
    unsafe: symbols(result.unsafeMutations),
    environment: [...result.environmentChanges],
    unknown: [...result.analysisUnknown],
  };
}

// Collect, reset the counters, then run the control action; counters cover the action only.
export function observeDirect(implementation, { source, approved, extra, action }) {
  return observing(probe => {
    const model = makeModel(source, approved, extra, probe);
    const result = implementation.collectMutationEffects(model);
    Object.assign(probe, createProbe());
    const value = action(model, result, implementation);
    const stats = { ...probe };
    return { sets: sets(model, result), extra: value, stats };
  });
}

// Full provenance run with the exact ordered dispatch/mutation/unknown/frame snapshot.
export function observeFull(implementation, sources) {
  return observing(probe => {
    const model = countedModel(new Map([MANIFEST, ...Object.entries(sources)]), undefined, probe);
    const result = implementation.createProvenance(model);
    const stats = { ...probe };
    return { snapshot: snapshot(model, result), stats };
  });
}

export function declarations(model, name) {
  const found = [];
  model.walk(model.parsed.get(FILE), node => {
    if (ts.isVariableDeclaration(node) && node.name.getText() === name) found.push(node);
  });
  return found;
}

export const initializer = (model, name) => declarations(model, name)[0].initializer;

// The next call to model[method] (matching `when`) throws once; later calls reach the real method.
export function failOnce(model, method, message, when = () => true) {
  const original = model[method];
  let armed = true;
  model[method] = node => {
    if (armed && when(node)) {
      armed = false;
      throw new Error(message);
    }
    return original(node);
  };
}

// The candidate may never do more model work than the reference, and strictly less where named.
export function assertReduced(actual, expected, fewer = []) {
  for (const key of Object.keys(expected))
    assert.ok(
      actual[key] <= expected[key],
      `${key} must not grow: ${actual[key]} > ${expected[key]}`
    );
  for (const key of fewer)
    assert.ok(
      actual[key] < expected[key],
      `${key} must shrink: ${actual[key]} >= ${expected[key]}`
    );
}
