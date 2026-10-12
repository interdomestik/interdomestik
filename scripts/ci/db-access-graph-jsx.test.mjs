import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AMBIENT_LEAF,
  CANONICAL_FILES,
  CHAIN,
  PAGE,
  branchingChain,
  graphProbe,
  pageWith,
  sharedCallerModels,
  wrapperChain,
} from './db-access-graph-jsx-fixture.mjs';

// Page is both a framework export root and an all-function root, so each actual mount is reached
// twice. Before the correction these fixtures measured 4, 6, 32 and 162 raw reaches.
for (const [label, depth, paired] of [
  ['self-closing leaf', 0, false],
  ['paired leaf', 0, true],
  ['three self-closing wrappers', 3, false],
  ['three paired wrappers', 3, true],
])
  test(`JSX component edge is inspected once per mount: ${label}`, () => {
    const { chain, page } = wrapperChain(AMBIENT_LEAF, depth, paired);
    const result = graphProbe(chain, page);
    assert.deepEqual(result.changed, [PAGE]);
    assert.deepEqual(result.reaches, { 'db.select': 2 }, JSON.stringify(result.reasons));
    assert.equal(result.reasons['graph bound exceeded'], undefined);
  });

test('two actual sibling mounts remain two distinct reaches', () => {
  const result = graphProbe(AMBIENT_LEAF, pageWith('Leaf', '<><Leaf/><Leaf/></>'));
  assert.deepEqual(result.reaches, { 'db.select': 4 });
});

test('namespace member tags select the exact target once for paired and self-closing syntax', () => {
  for (const mount of ['<components.Leaf></components.Leaf>', '<components.Leaf/>']) {
    const page = `import * as components from "../chain"; export default function Page(){return ${mount};}`;
    assert.deepEqual(graphProbe(AMBIENT_LEAF, page).reaches, { 'db.select': 2 }, mount);
  }
});

test('callback and spread props on intrinsic elements keep their unchanged executable edges', () => {
  const body = '<><button onClick={Leaf}/><button {...{onClick:Leaf}}/></>';
  assert.deepEqual(graphProbe(AMBIENT_LEAF, pageWith('Leaf', body)).reaches, { 'db.select': 6 });
});

test('component props, spreads, children and expressions remain traversed', () => {
  const chain = `${AMBIENT_LEAF} export function Box(){return null;}`;
  for (const body of [
    '<Box value={Leaf()}/>',
    '<Box {...{run: Leaf}}/>',
    '<Box>{Leaf()}</Box>',
    '<Box><Leaf/></Box>',
  ])
    assert.deepEqual(
      graphProbe(chain, pageWith('Leaf, Box', body)).reaches,
      { 'db.select': 2 },
      body
    );
});

test('received callback properties of a component stay incomplete', () => {
  const chain = `${AMBIENT_LEAF} export function Box(props){return props.onLoad();}`;
  const result = graphProbe(chain, pageWith('Leaf, Box', '<Box onLoad={Leaf}/>'));
  assert.ok(result.failures.length > 0);
  assert.ok(
    Object.keys(result.reasons).some(reason => /received property executable/u.test(reason)),
    JSON.stringify(result.reasons)
  );
});

test('a mutated component keeps its unknown diagnostic; a found target never rescues it', () => {
  const mutated = graphProbe(
    'export let Widget=()=>null; Widget=unknownReplacement;',
    pageWith('Widget', '<Widget/>')
  );
  assert.deepEqual(mutated.failures, []);
  assert.deepEqual(mutated.reasons, { 'mutated or unsupported executable reference': 2 });
  const mixed = graphProbe(
    `${AMBIENT_LEAF} export let Widget=Leaf; Widget=other;`,
    pageWith('Widget', '<Widget></Widget>')
  );
  assert.deepEqual(mixed.reaches, { 'db.select': 2 });
  assert.equal(mixed.reasons['mutated or unsupported executable reference'], 2);
});

test('unresolved local component imports stay incomplete', () => {
  const page =
    'import {Missing} from "../missing"; export default function Page(){return <Missing/>;}';
  assert.deepEqual(graphProbe('', page).reasons, {
    'unresolved module initialization ../missing': 1,
    'unresolved JSX edge Missing': 2,
  });
});

test('direct and indirect JSX recursion and genuine depth stay incomplete', () => {
  const direct = graphProbe(
    'export function Repeat(){return <Repeat/>;}',
    pageWith('Repeat', '<Repeat/>')
  );
  assert.ok(direct.reasons['recursive executable edge'] > 0, JSON.stringify(direct.reasons));
  const indirect = graphProbe(
    'export function A(){return <B/>;} export function B(){return <A></A>;}',
    pageWith('A', '<A/>')
  );
  assert.ok(indirect.reasons['recursive executable edge'] > 0, JSON.stringify(indirect.reasons));
  const { chain, page } = wrapperChain('export function Leaf(){return null;}', 52, false);
  assert.ok(graphProbe(chain, page).reasons['graph bound exceeded'] > 0);
});

test('safe acyclic paired wrappers, empty leaves and shadowed bindings pass', () => {
  const safe = wrapperChain('export function Leaf(){return null;}', 8, true);
  for (const [chain, page] of [
    [safe.chain, safe.page],
    ['export function Leaf(){return null;}', pageWith('Leaf', '<Leaf/>')],
    [
      `${AMBIENT_LEAF} export const Widget = Leaf;`,
      'import {Widget} from "../chain"; function Inner(){ const Widget = () => null; return <Widget/>; } export default function Page(){return <Inner/>;}',
    ],
  ]) {
    const result = graphProbe(chain, page);
    assert.deepEqual(result.failures, [], page);
    assert.deepEqual(result.incomplete, [], page);
  }
});

test('historical helpers under test filenames mounted by a real page remain visible', () => {
  const file = 'apps/web/src/__tests__/helpers.test.tsx';
  const page =
    'import {Leaf} from "../__tests__/helpers.test"; export default function Page(){return <Leaf/>;}';
  assert.deepEqual(graphProbe(AMBIENT_LEAF, page, file).reaches, { 'db.select': 2 });
});

// A binary DAG of depth d performs 2^(d + 1) - 1 actual mounts per root while no path is deeper
// than d + 2 components (the depth bound is 48). The 20000 work bound is shared per origin by both
// Page roots, so depth 11 stays near 8200 mounts and depth 15 needs about 131000.
test('shallow sibling DAG mounts keep their actual multiplicity under the work bound', () => {
  const { chain, page } = branchingChain(AMBIENT_LEAF, 3);
  const result = graphProbe(chain, page);
  const mounts = 2 * 2 ** 3;
  assert.deepEqual(result.reaches, { 'db.select': mounts }, JSON.stringify(result.reasons));
  // The minimal db={} fixture has no callable select member. Each actual mount retains both
  // existing unresolved-call diagnostics; no recursion or work-bound diagnostic is introduced.
  assert.deepEqual(result.reasons, {
    'unresolved local edge db.select': mounts,
    'unsupported received property executable edge db.select': mounts,
  });
});

test('genuine work exhaustion on a shallow acyclic DAG is incomplete, never safe', () => {
  const leaf = 'export function Leaf(){return null;}';
  const within = branchingChain(leaf, 11);
  const control = graphProbe(within.chain, within.page);
  assert.deepEqual(control.incomplete, [], JSON.stringify(control.reasons));
  assert.deepEqual(control.failures, []);
  const { chain, page } = branchingChain(leaf, 15);
  const result = graphProbe(chain, page);
  // Only the work bound explains it: no recursion, unresolved edge or depth diagnostic.
  assert.deepEqual(Object.keys(result.reasons), ['graph bound exceeded']);
  assert.ok(result.incomplete.length > 0);
  const ambient = branchingChain(AMBIENT_LEAF, 15);
  const partial = graphProbe(ambient.chain, ambient.page);
  assert.ok(partial.failures.length > 0);
  assert.ok(partial.reasons['graph bound exceeded'] > 0);
});

test('a parse error in a trusted imported component stays incomplete, never safe', () => {
  const unknown = /^unresolved (?:module initialization|JSX edge)/u;
  for (const mount of ['<Broken/>', '<Broken></Broken>']) {
    const result = graphProbe(
      'export function Broken(){return (<div>;}',
      pageWith('Broken', mount)
    );
    const reasons = Object.keys(result.reasons);
    assert.deepEqual(result.changed, [PAGE], mount);
    assert.equal(result.reasons['parse diagnostics in changed source'], undefined, mount);
    assert.ok(
      reasons.some(reason => unknown.test(reason)),
      JSON.stringify(result.reasons)
    );
  }
  const valid = graphProbe('export function Valid(){return null;}', pageWith('Valid', '<Valid/>'));
  assert.deepEqual(valid.incomplete, []);
  assert.deepEqual(valid.failures, []);
});

// The declared external dependency means a missing module can not explain the result.
const EXTERNAL = [
  [
    'apps/web/package.json',
    JSON.stringify({ name: '@interdomestik/web', dependencies: { 'external-library': '1' } }),
  ],
];
const FACTORIES = {
  'external call':
    'import {createWidget} from "external-library"; export const Widget = createWidget();',
  'external constructor':
    'import {Factory} from "external-library"; export const Widget = new Factory();',
  'external wrapper of a local component':
    'import {wrap} from "external-library"; function Inner(){return null;} export const Widget = wrap(Inner);',
};
const widgetEdge = reason => /JSX edge Widget|executable reference/u.test(reason);

test('opaque external component factories stay incomplete when mounted', () => {
  for (const [label, chain] of Object.entries(FACTORIES)) {
    for (const mount of ['<Widget/>', '<Widget></Widget>']) {
      const result = graphProbe(chain, pageWith('Widget', mount), CHAIN, EXTERNAL);
      const detail = `${label} ${mount} ${JSON.stringify(result.reasons)}`;
      assert.ok(Object.keys(result.reasons).some(widgetEdge), detail);
      assert.equal(result.reasons['unresolved module initialization external-library'], undefined);
    }
    // Importing without mounting never produces the mounted-component diagnostic.
    const idle = graphProbe(chain, pageWith('Widget', 'null'), CHAIN, EXTERNAL);
    assert.deepEqual(Object.keys(idle.reasons).filter(widgetEdge), [], label);
  }
  for (const chain of [
    'export function Widget(){return null;}',
    'export const Widget = () => null;',
  ])
    for (const mount of ['<Widget/>', '<Widget></Widget>']) {
      const safe = graphProbe(chain, pageWith('Widget', mount), CHAIN, EXTERNAL);
      assert.deepEqual(safe.incomplete, [], chain);
      assert.deepEqual(safe.failures, [], chain);
    }
});

// Lower-level proof only: model, provenance, inventory and graph. It does not exercise the
// authenticated CLI, trust pins or adoption, so it never implies a full guard pass.
const MIXED = [
  'import {db, withTenantContext} from "@interdomestik/database";',
  'export function Safe(){ return withTenantContext({}, tx => tx.select()); }',
  'export function Ambient(){ return db.select(); }',
].join(' ');
const wrapper = body => `${MIXED} export function Wrapper(){ return <>${body}</>; }`;
const postures = (result, callee) =>
  result.entries.filter(item => item.callee === callee).map(item => item.tenantPosture);

test('a wrapper mounting canonical and ambient leaves keeps the ambient reach in any order', () => {
  for (const body of [
    '<Safe/><Ambient/>',
    '<Ambient/><Safe/>',
    '<Safe></Safe><Ambient></Ambient>',
    '<Ambient></Ambient><Safe/>',
  ]) {
    const page = pageWith('Wrapper', '<Wrapper/>');
    const result = graphProbe(wrapper(body), page, CHAIN, CANONICAL_FILES);
    assert.deepEqual(result.reaches, { 'db.select': 2 }, body);
    assert.ok(
      result.failures.every(item => item.mountedFrom === PAGE),
      body
    );
    assert.deepEqual(postures(result, 'tx.select'), ['tenant-context'], body);
    const ambient = postures(result, 'db.select');
    assert.equal(ambient.length, 1, body);
    assert.notEqual(ambient[0], 'tenant-context', body);
  }
  const canonical = graphProbe(
    wrapper('<Safe/>'),
    pageWith('Wrapper', '<Wrapper/>'),
    CHAIN,
    CANONICAL_FILES
  );
  assert.deepEqual(canonical.failures, []);
  assert.deepEqual(postures(canonical, 'tx.select'), ['tenant-context']);
});

test('the same JSX wrapper preserves canonical and ambient caller alternatives', () => {
  const [only, ...mixed] = sharedCallerModels();
  const canonical = graphProbe(only.chain, only.page, CHAIN, CANONICAL_FILES);
  assert.deepEqual(canonical.failures, []);
  assert.deepEqual(canonical.incomplete, []);
  assert.deepEqual(postures(canonical, 'tx.select'), ['tenant-context']);
  for (const { chain, page, kinds } of mixed) {
    const result = graphProbe(chain, page, CHAIN, CANONICAL_FILES);
    assert.deepEqual(postures(result, 'tx.select'), ['unclassified']);
    const leaves = result.failures.filter(
      item => item.file === CHAIN && item.callee === 'tx.select' && item.method === 'select'
    );
    assert.ok(leaves.length > 0);
    for (const leaf of leaves) {
      assert.equal(leaf.mountedFrom, PAGE);
      assert.equal(leaf.tenantPosture, 'unclassified');
      assert.equal(leaf.reason, 'changed executable edge reaches ambient operation');
      assert.deepEqual(
        leaf.dispatchAlternatives.map(item => item.kind),
        kinds
      );
    }
  }
});
