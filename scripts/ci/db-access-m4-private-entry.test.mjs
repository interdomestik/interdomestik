import test from 'node:test';
import assert from 'node:assert/strict';
import { createLineageObserver } from './db-access-m4-lineage-observer.mjs';
import { validateLineageBatch } from './db-access-m4-lineage-wire.mjs';
import { hash } from './db-access-m4-private-test.fixture.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { mountedAcceptanceFixture as acceptanceFixture } from './db-access-m4-mounted-integration-test.fixture.mjs';
import * as privateData from './db-access-m4-private-acceptance-data.mjs';

function emissionFixture() {
  const owner = {},
    nativeEntry = {},
    ownerLocator = ['source.ts', 0, 50, 220];
  const selected = {
    inventoryIndex: 17,
    identity: hash('original-id'),
    owner: ownerLocator,
    incomplete: true,
    reason: 'original return obligation',
  };
  const ownerData = {
    owner: ownerLocator,
    memberships: [{ family: 'fixed factory', side: 'retained' }],
    entries: [selected],
  };
  const selection = {
    owners: new Map([[owner, ownerData]]),
    nativeEntries: new WeakMap([[nativeEntry, selected]]),
    description: { entries: [selected], source: 'unit-fixed-selection' },
  };
  const binding = {
    sourcePolicyDigest: hash('source-policy'),
    sourceBookends: { before: 's', after: 's' },
    modelDigest: hash('model'),
  };
  const observer = createLineageObserver(
    selection,
    () => null,
    () => undefined
  );
  observer.begin();
  for (let i = 0; i < 2; i++) {
    const visit = observer.observe(owner, 'source.ts', null, null, null, 'visited');
    observer.attribute(visit, 'entry-incomplete', selected.reason, nativeEntry);
  }
  return { batch: observer.finish(binding, ['source.ts']), selection, binding };
}
test('same original emission hook accounts exact original entry/context multiplicity without collector wrapping', () => {
  const f = emissionFixture();
  assert.equal(f.batch.observations[0].occurrences, 2);
  assert.equal(f.batch.entryEmissions[0].occurrences, 2);
  assert.equal(f.batch.entryEmissions[0].inventoryIndex, 17);
  validateLineageBatch(f.batch, f.selection, f.binding, ['source.ts'], () => true);
});
test('missing, orphan, wrong-index or inflated entry emission is rejected at worker data join', () => {
  for (const mutate of [
    f => {
      f.batch.entryEmissions = [];
    },
    f => {
      f.batch.entryEmissions[0].observationKey = hash('orphan');
    },
    f => {
      f.batch.entryEmissions[0].inventoryIndex = 18;
    },
    f => {
      f.batch.entryEmissions[0].occurrences = 3;
    },
  ]) {
    const f = emissionFixture();
    mutate(f);
    assert.throws(() =>
      validateLineageBatch(f.batch, f.selection, f.binding, ['source.ts'], () => true)
    );
  }
});

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(
  new URL('./db-access-m4-runtime-pairing.mjs', import.meta.url),
  'utf8'
);
const unit = ts.createSourceFile('pairing.mjs', source, ts.ScriptTarget.Latest, true);
const declaration = unit.statements.find(
  node => ts.isFunctionDeclaration(node) && node.name?.text === 'acceptOwnedPrivateConstruction'
);
assert.ok(declaration);
assert.equal(
  declaration.modifiers?.some(node => node.kind === ts.SyntaxKind.ExportKeyword) ?? false,
  false
);
function fixture(input) {
  const token = {},
    live = new WeakMap([[token, input.ordinary]]);
  let takes = 0;
  const context = vm.createContext({
    takeFixedM4P2ForJoin(value) {
      const evidence = live.get(value);
      if (!evidence) throw Error('one-use double already burned');
      live.delete(value);
      takes++;
      return evidence;
    },
    projectFixedPrivateAcceptance: privateData.projectFixedPrivateAcceptance,
    fail: reason => {
      throw Error(reason);
    },
  });
  const invoke = vm.compileFunction(
    declaration.body.getText(unit).slice(1, -1),
    ['state', 'input', 'native', 'event', 'effectAssertions', 'workerLoaderInspection'],
    { parsingContext: context }
  );
  const state = {
    ordinary: token,
    runtime: input.runtime,
    native: { outputDigest: input.nativeOutputDigest },
  };
  return {
    call: () =>
      invoke(
        state,
        {},
        input.native,
        input.event,
        input.effectAssertions,
        input.workerLoaderInspection
      ),
    state,
    takes: () => takes,
  };
}
test('proposed lexical private entry consumes once and returns conditional exact class acceptance', () => {
  const f = fixture(acceptanceFixture()),
    result = f.call();
  assert.equal(result.privateAcceptance.acceptedOriginalIdentities.length, 0);
  assert.equal(f.takes(), 1);
  assert.equal(f.state.ordinaryTaken, true);
  assert.throws(f.call, /burned/u);
});
test('valid source/runtime inputs with missing native context guarantee fail final proposed private entry', () => {
  const input = acceptanceFixture();
  input.effectAssertions.assignmentContextProof.profiles[0].capturedConstructions[0].ordinal = 99;
  const f = fixture(input);
  assert.throws(f.call, /M4 mounted assignment refused: foreign construction reference/u);
  assert.equal(f.state.ordinaryTaken, true);
  assert.equal(f.takes(), 1);
  assert.throws(f.call, /burned/u);
});

// Selected-path and lineage observers are real; ownership and the bridge are test doubles.
// This is not a branded census or a substitute for the original old/new census comparison.
test('selected emissions and diagnostics remain unchanged alongside lineage in outside and nested visits', async () => {
  const { fixture: pathFixture } =
    await import('./db-access-m4-selected-path-observer.test-fixture.mjs');
  const { createGraphEntryEmitter } = await import('./db-access-graph-emissions.mjs');
  const { createM4AttributionCollector } = await import('./db-access-m4-context-attribution.mjs');
  function run(mode, enabled) {
    const f = pathFixture(),
      attribution = createM4AttributionCollector();
    const entry = {
      identity: 'selected',
      file: 'selected.ts',
      _owner: f.selected,
      _node: f.selected,
      _incomplete: true,
      _indirect: false,
      reason: 'original reason',
    };
    const child = {
      identity: 'factory',
      file: 'child.ts',
      _owner: f.child,
      _node: f.child,
      _incomplete: true,
      _indirect: false,
      reason: 'factory reason',
    };
    const selected = {
      inventoryIndex: 1,
      identity: child.identity,
      owner: ['child.ts', 0, 10, 262],
      incomplete: true,
      reason: child.reason,
    };
    const selection = {
      owners: new Map([[f.child, { owner: selected.owner, memberships: [], entries: [selected] }]]),
      nativeEntries: new WeakMap([[child, selected]]),
      description: { entries: [selected] },
    };
    const lineage = createLineageObserver(
      selection,
      () => null,
      () => undefined
    );
    lineage.begin();
    const output = { failures: [], incomplete: f.collector };
    const bridge = {
      attribute(token, kind, reason, item) {
        if (enabled) lineage.attribute(token?.lineage, kind, reason, item);
        if (token?.row) {
          const key = attribution.add([token.row], kind, reason);
          f.observer.legacy(key, token.row.origin, reason);
        }
      },
    };
    const emit = createGraphEntryEmitter([entry, child], bridge);
    const visit = (owner, action) => {
      const row = owner === f.selected ? f.row('selected') : null;
      const scope = f.observer.enter(owner, 'root.ts', null, null, null);
      if (row) f.observer.activate(new Map([[entry, row]]));
      const token = {
        row,
        lineage: enabled ? lineage.observe(owner, 'root.ts', null, null, null, 'visited') : null,
      };
      emit(owner, 'root.ts', output, token);
      action?.();
      f.observer.leave(scope);
    };
    if (mode === 'outside') visit(f.child);
    if (mode === 'nested') visit(f.selected, () => visit(f.child));
    if (mode === 'reverse') visit(f.child, () => visit(f.selected));
    const projection = f.finish();
    assert.equal(f.collector.push, f.originalPush);
    return {
      projection,
      attributions: attribution.entries(),
      diagnostics: f.collector.entries,
      rawCount: f.collector.rawCount,
      failures: output.failures,
    };
  }
  for (const mode of ['outside', 'nested', 'reverse'])
    assert.deepEqual(run(mode, true), run(mode, false), mode);
});
