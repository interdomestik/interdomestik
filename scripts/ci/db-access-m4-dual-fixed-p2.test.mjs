import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { partitionOrdinarySources, P2_SOURCE, LEGACY_P2_SOURCE } from './p2/source-fence.mjs';
import {
  legacyBankPartition,
  materializeFixedLegacyBank,
  assertFixedLegacyBankCurrent,
} from './p2/legacy-bank.mjs';
import { projectOriginalFactoryBank } from './db-access-m4-original-factory-bank.mjs';
import { acceptanceFixture } from './db-access-m4-private-test.fixture.mjs';
import { lineageObservationKey } from './db-access-m4-factory-context-rule.mjs';
import { takeFixedM4P2ForJoin } from './db-access-m4-p2-ordinary.mjs';
import { takeFreshM4C0CoverageForJoin } from './p2/ordinary-dispatch.mjs';
import { bootstrapFixture, dispatchFixture } from './db-access-m4-p2-c0-purpose.fixture.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url)),
  hash = x => createHash('sha256').update(x).digest('hex');
function fixture() {
  const x = acceptanceFixture();
  x.ordinary.originalFactoryBank = {
    kind: 'fresh-original-admin-factory-nine',
    imageId: 'unit-only-original-image',
    sourceContext: JSON.stringify(x.event.context),
    sourceBefore: x.ordinary.sourceBefore,
    parentBefore: x.ordinary.parentBefore,
    ordinaryArtifactDigest: x.ordinary.ordinaryArtifactDigest,
    execution: x.ordinary.execution,
    directFactoryCoverageObserved: false,
    productionCCredit: 0,
    nativeAdmission: false,
  };
  return x;
}
const project = x => projectOriginalFactoryBank(x.native, x.ordinary, x.event);
const active = x =>
  x.native.rawGraph.m4Contexts.affectedLineage.batches.find(b => b.observations.length);
function rekey(x) {
  const b = active(x);
  for (let i = 0; i < b.observations.length; i++)
    if (b.entryEmissions[i])
      b.entryEmissions[i].observationKey = lineageObservationKey(b.observations[i]);
}
test('two exact old IDs belong to original P class, not the preserved55 T identities', () => {
  const x = fixture(),
    before = JSON.stringify(x),
    r = project(x);
  assert.equal(r.acceptedOriginalIdentities.length, 2);
  assert.equal(r.accounting.acceptedContextOccurrences, 5);
  assert.equal(r.accounting.originalSelectedCohort.identities.endExclusive, 55);
  assert.equal(r.accounting.originalSelectedCohort.contextOccurrences, 1685);
  assert(
    r.acceptedOriginalIdentities.every(
      id => !x.native.rawGraph.m4Contexts.selectedIdentities.includes(id)
    )
  );
  assert.equal(r.originalSelectedTrustedCohortAccepted, false);
  assert.equal(r.nativeAdmission, false);
  assert.equal(r.wholeM4Complete, false);
  assert.equal(JSON.stringify(x), before);
});
for (const [name, mutate] of [
  ['missing bank', x => delete x.ordinary.originalFactoryBank],
  ['foreign bank kind', x => (x.ordinary.originalFactoryBank.kind = 'qualification-ten')],
  ['foreign event', x => (x.ordinary.originalFactoryBank.sourceContext = 'other')],
  [
    'foreign artifact',
    x => (x.ordinary.originalFactoryBank.ordinaryArtifactDigest = hash('other')),
  ],
  ['foreign source', x => (x.ordinary.originalFactoryBank.sourceBefore = hash('other'))],
  ['foreign producer', x => (x.ordinary.originalFactoryBank.parentBefore = hash('other'))],
  ['missing image', x => (x.ordinary.originalFactoryBank.imageId = '')],
  [
    'invented factory V8 coverage',
    x => (x.ordinary.originalFactoryBank.directFactoryCoverageObserved = true),
  ],
  ['missing original case', x => x.ordinary.originalFactoryBank.execution.actualCases.pop()],
  ['swapped case order', x => x.ordinary.originalFactoryBank.execution.actualCases.reverse()],
  ['inflated observation occurrence', x => active(x).observations[0].occurrences++],
  ['inflated emission occurrence', x => active(x).entryEmissions[0].occurrences++],
  [
    'duplicate observation',
    x => active(x).observations.push(structuredClone(active(x).observations[0])),
  ],
  [
    'duplicate emission',
    x => active(x).entryEmissions.push(structuredClone(active(x).entryEmissions[0])),
  ],
  [
    'missing old context',
    x => {
      active(x).observations.shift();
      active(x).entryEmissions.shift();
    },
  ],
  [
    'unknown caller frame',
    x => {
      active(x).observations[0].context = 'unknown';
      rekey(x);
    },
  ],
  [
    'foreign actual origin',
    x => {
      const b = active(x);
      b.observations[0].origin = 'other.ts';
      b.entryEmissions[0].origin = 'other.ts';
      rekey(x);
    },
  ],
  ['incomplete root partition', x => active(x).roots.pop()],
  [
    'T-cohort widening',
    x =>
      (x.native.rawGraph.m4Contexts.selectedIdentities[0] =
        x.native.inventory.entries[55].row.identity),
  ],
])
  test(name + ' refuses without deleting raw obligations', () => {
    const x = fixture();
    mutate(x);
    assert.throws(() => project(x));
  });
test('one authenticated global two-source partition has truthful bank projections and ambient complement', () => {
  const input = [P2_SOURCE, 'outside.test.ts', LEGACY_P2_SOURCE],
    global = partitionOrdinarySources(input),
    legacy = legacyBankPartition(global);
  assert.deepEqual(global.capsule, [P2_SOURCE, LEGACY_P2_SOURCE]);
  assert.deepEqual(legacy.capsule, [LEGACY_P2_SOURCE]);
  assert.deepEqual(legacy.siblingCapsules, [P2_SOURCE]);
  assert.deepEqual(legacy.globalCapsule, global.capsule);
  assert.deepEqual(legacy.ambient, ['outside.test.ts']);
  assert.deepEqual([...global.capsule, ...global.ambient].sort(), input.sort());
  assert.throws(() => partitionOrdinarySources([P2_SOURCE]));
  assert.throws(() => legacyBankPartition({ capsule: [LEGACY_P2_SOURCE], ambient: [] }));
});
test('case/source metadata never registers private aggregate authority', () => {
  const x = fixture();
  for (const data of [
    x.ordinary.originalFactoryBank,
    structuredClone(x.ordinary.originalFactoryBank),
  ]) {
    assert.throws(() => takeFixedM4P2ForJoin(data, { context: x.event.context }));
    assert.throws(() => takeFreshM4C0CoverageForJoin(data, x.event.context));
  }
});
test('existing purpose-bound invocation/results remain one-use and reject copies', () => {
  const context = fixture().event.context,
    b = bootstrapFixture(),
    r = {},
    c = {};
  b.seedResult(r, 'm4-c0', context);
  assert.throws(() => b.takeBootstrappedP2CoverageForJoin(r, context));
  assert.throws(() => b.takeBootstrappedM4C0CoverageForJoin(c, context));
  b.takeBootstrappedM4C0CoverageForJoin(r, context);
  assert.throws(() => b.takeBootstrappedM4C0CoverageForJoin(r, context));
  const d = dispatchFixture(context),
    q = {};
  d.seed(q, 'm4-c0');
  d.takeFreshM4C0CoverageForJoin(q, context);
  assert.throws(() => d.takeFreshM4C0CoverageForJoin(q, context));
});
test('both backend entry calls are awaited in order before either bank can create aggregate success', () => {
  const text = fs.readFileSync(new URL('./p2/ordinary-dispatch.mjs', import.meta.url), 'utf8');
  const first = text.indexOf('await runRequiredP2Runtime(options)'),
    second = text.indexOf('await runRequiredLegacyP2Runtime(options)'),
    store = text.indexOf('freshCoverageResults.set(result');
  assert(first > 0 && second > first && store > second);
  assert(!text.slice(first, second).includes('Promise.all'));
  assert(text.includes('fixedCaseCount: 19'));
  assert(text.includes('originalFactoryBank: immutable'));
});

function projectionFixture(run) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-fixed-bank-unit-'))),
    producer = path.join(base, 'producer'),
    out = path.join(base, 'out');
  fs.mkdirSync(producer);
  fs.mkdirSync(out);
  const names = [
    'policy.json',
    'capsule-layout.json',
    'registry.mjs',
    'run-suite.mjs',
    ...['wrapper', 'wrapper.test'].flatMap(n =>
      ['original.ts', 'source.ts', 'mjs', 'js.map'].map(s => `dist/${n}.${s}`)
    ),
  ];
  const records = {};
  for (const name of names) {
    const f = 'scripts/ci/p2/legacy-bank/' + name,
      text = 'unit-only closed filesystem data ' + name,
      p = path.join(producer, f);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
    records[f] = { bytes: Buffer.byteLength(text), sha256: hash(text), mode: '100644' };
  }
  try {
    return run({ base, producer, out, records });
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}
test('fixed legacy projection has exact source and file/directory bookends, no caller-root substitution', () =>
  projectionFixture(({ producer, out, records }) => {
    const view = materializeFixedLegacyBank(producer, out, records);
    assert.equal(typeof assertFixedLegacyBankCurrent(view), 'string');
    assert.throws(() => assertFixedLegacyBankCurrent({ ...view }));
    fs.writeFileSync(path.join(view.root, 'foreign'), 'extra');
    assert.throws(() => assertFixedLegacyBankCurrent(view));
  }));
test('projected or original source mutation refuses despite preserved filename', () =>
  projectionFixture(({ producer, out, records }) => {
    const view = materializeFixedLegacyBank(producer, out, records);
    fs.writeFileSync(path.join(view.root, 'scripts/ci/p2/capsule/registry.mjs'), 'changed');
    assert.throws(() => assertFixedLegacyBankCurrent(view));
  }));
test('missing fixed bank input refuses and output cannot overlap producer', () =>
  projectionFixture(({ producer, out, records }) => {
    delete records['scripts/ci/p2/legacy-bank/registry.mjs'];
    assert.throws(() => materializeFixedLegacyBank(producer, out, records));
    assert.throws(() => materializeFixedLegacyBank(producer, producer, records));
  }));
