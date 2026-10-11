import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CASES,
  counts,
  expectedSchedule,
  load,
  moduleTexts,
  observe,
  progress,
  schedule,
  sortedNames,
} from './db-access-mutations-settlement-fixture.mjs';

// Executed Astra controls: [rounds, candidate resets, candidate sweeps, ordered analysisUnknown].
// The frozen original resets the dispatch and sweeps opaque calls once in every round.
const CONTROLS = new Map([
  ['reverse-strict-6', [7, 2, 2, []]],
  ['reverse-unstrict-6', [2, 2, 2, []]],
  ['reverse-strict-34-dispatch-bound', [17, 2, 2, ['dispatch-round-bound']]],
  ['reverse-strict-40-settlement-bound', [32, 2, 2, ['mutation-dispatch-settlement-bound']]],
  ['late-mutation-after-stable-opaque', [7, 7, 7, []]],
  ['alias-mutation-growth', [2, 2, 2, []]],
  ['factory-late-escape', [2, 2, 2, []]],
  ['recursive-unknown', [2, 2, 2, []]],
]);
// The explicit write in f0 must reach every chain parameter and the root binding as strict.
const STRICT_CHAIN = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'root'];
const SOURCES = new Map(CASES);
const reference = await load('reference');
const candidate = await load('candidate');

// The frozen original supplies every expected security outcome; the schedule oracle is evaluated
// on the frozen reference progression, never on candidate code.
function differential(name, original, proposal) {
  const before = observe(original, SOURCES.get(name));
  const after = observe(proposal, SOURCES.get(name));
  assert.deepEqual(after.snapshot, before.snapshot, `${name} ordered evidence`);
  assert.deepEqual(after.interruptions, before.interruptions, `${name} interruptions`);
  assert.deepEqual(
    after.invocations.map(progress),
    before.invocations.map(progress),
    `${name} mutation and strict progress`
  );
  assert.deepEqual(
    after.invocations.map(schedule),
    before.invocations.map(expectedSchedule),
    `${name} schedule`
  );
  return { before, after };
}

test('the frozen original finish is an independent reference over identical outer code', () => {
  const { reference: original, candidate: current } = moduleTexts();
  assert.notEqual(current, original);
  const outside = text => [
    text.slice(0, text.indexOf('  function finish(provenance) {')),
    text.slice(text.lastIndexOf('  return {')),
  ];
  assert.deepEqual(outside(current), outside(original));
  for (const text of [current, original]) assert.equal(text.split('round < 32').length, 2);
});

test('executed Astra controls keep identical ordered evidence with bounded reuse', () => {
  assert.deepEqual(
    [...CONTROLS.keys()],
    CASES.map(([name]) => name)
  );
  for (const [name, [rounds, resets, sweeps, unknown]] of CONTROLS) {
    const { before, after } = differential(name, reference, candidate);
    assert.equal(before.invocations.length, 1, name);
    assert.equal(after.invocations.length, 1, name);
    assert.deepEqual(
      counts(before.invocations[0]),
      { rounds, resets: rounds, sweeps: rounds },
      name
    );
    assert.deepEqual(counts(after.invocations[0]), { rounds, resets, sweeps }, name);
    assert.deepEqual(after.snapshot.analysisUnknown, unknown, name);
  }
});

test('strict-only rounds keep the full propagation walk without rebuilding', () => {
  const { after } = differential('reverse-strict-6', reference, candidate);
  const [rounds] = after.invocations;
  const strictOnly = rounds.filter(
    round =>
      round.sweeps === 0 && round.end?.[0] === round.start[0] && round.end[1] > round.start[1]
  );
  assert.equal(strictOnly.length, 4);
  assert.ok(strictOnly.every(round => round.resets === 0));
  assert.deepEqual(rounds.at(-1).end, rounds.at(-1).start);
  for (const name of STRICT_CHAIN) {
    assert.ok(sortedNames(after.result.unsafeMutations).includes(name), name);
    assert.ok(sortedNames(after.result.mutations).includes(name), name);
  }
  const loose = differential('reverse-unstrict-6', reference, candidate).after.result;
  assert.equal(loose.unsafeMutations.size, 0);
  for (const name of STRICT_CHAIN) assert.ok(sortedNames(loose.mutations).includes(name), name);
});

test('a late mutation after a stable opaque sweep rebuilds and resweeps every round', () => {
  const { after } = differential('late-mutation-after-stable-opaque', reference, candidate);
  const [rounds] = after.invocations;
  assert.equal(rounds.length, 7);
  for (const round of rounds) assert.deepEqual([round.resets, round.sweeps], [1, 1]);
  for (const round of rounds.slice(0, -1)) assert.ok(round.end[0] > round.start[0]);
});

test('a repeated finish starts a fresh local schedule', async () => {
  const [original, proposal] = await Promise.all([
    load('reference', 'twice'),
    load('candidate', 'twice'),
  ]);
  for (const name of ['reverse-strict-6', 'late-mutation-after-stable-opaque']) {
    const once = observe(reference, SOURCES.get(name));
    const { after } = differential(name, original, proposal);
    assert.equal(after.invocations.length, 2, name);
    assert.deepEqual(progress(after.invocations[0]), progress(once.invocations[0]), name);
    const second = after.invocations[1];
    assert.deepEqual(schedule(second), [[1, 1]], name);
    assert.deepEqual(second[0].end, second[0].start, name);
    assert.deepEqual(after.snapshot, once.snapshot, name);
  }
});

test('interleaved models never share schedule or dispatch evidence', () => {
  for (const name of [
    'reverse-strict-6',
    'late-mutation-after-stable-opaque',
    'factory-late-escape',
    'reverse-strict-6',
    'alias-mutation-growth',
  ])
    differential(name, reference, candidate);
});

test('absent dispatch stays source-compatible with the frozen reference', async () => {
  const [original, proposal] = await Promise.all([
    load('reference', 'absent'),
    load('candidate', 'absent'),
  ]);
  const attempt = (createProvenance, name) => {
    try {
      observe(createProvenance, SOURCES.get(name));
      return {};
    } catch (error) {
      return { error: String(error?.message ?? error) };
    }
  };
  for (const name of ['reverse-strict-6', 'alias-mutation-growth', 'recursive-unknown']) {
    const before = attempt(original, name);
    assert.deepEqual(attempt(proposal, name), before, name);
    if (before.error === undefined) differential(name, original, proposal);
  }
});

test('an interrupted dispatch read never leaves completed evidence for the retry', async () => {
  const [original, proposal] = await Promise.all([
    load('reference', 'interrupted'),
    load('candidate', 'interrupted'),
  ]);
  for (const name of ['reverse-strict-6', 'late-mutation-after-stable-opaque']) {
    const { before, after } = differential(name, original, proposal);
    assert.equal(before.interruptions.length, 1, name);
    assert.equal(before.interruptions[0].interruption, 'injected dispatch read failure', name);
    assert.equal(after.invocations.length, 2, name);
    assert.deepEqual(schedule(after.invocations[1])[0], [1, 1], name);
    const complete = observe(reference, SOURCES.get(name)).result;
    for (const key of ['mutations', 'unsafeMutations'])
      assert.deepEqual(
        sortedNames(after.result[key]),
        sortedNames(complete[key]),
        `${name} ${key}`
      );
  }
  const strict = observe(proposal, SOURCES.get('reverse-strict-6')).result;
  for (const name of STRICT_CHAIN)
    assert.ok(sortedNames(strict.unsafeMutations).includes(name), name);
});
