import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createM4AttributionCollector,
  describeUnattributedDiagnostics,
  m4ObservationKey,
  validateM4Attributions,
} from './db-access-m4-context-attribution.mjs';

import { observation, collect, incomplete, validate } from './db-access-m4-context-test-utils.mjs';

test('two selected identities share ONE owner recursion emission and multiplicity', () => {
  const rows = ['a', 'b'].map(identity =>
    observation({
      identity,
      outcome: 'recursion',
      occurrences: 3,
    })
  );
  const attrs = collect(rows, 'owner-recursion', 'recursive executable edge', 3);
  const diagnostics = incomplete({
    file: 'root-a.ts',
    reason: 'recursive executable edge',
    occurrences: 3,
  });
  assert.equal(attrs.length, 1);
  assert.equal(attrs[0].observationKeys.length, 2);
  assert.equal(attrs[0].occurrences, 3);
  validate(rows, attrs, diagnostics);
  assert.equal(describeUnattributedDiagnostics(diagnostics, attrs)[0].attributedOccurrences, 3);
  const perIdentity = rows.flatMap(row =>
    collect([row], 'owner-recursion', 'recursive executable edge', 3)
  );
  assert.throws(() => validate(rows, perIdentity, diagnostics), /selected emission/);
});

test('same identity through multiple frames binds original failure emissions, not deduped failures', () => {
  const rows = [null, 'unknown-frame'].map(context => observation({ context }));
  const reason = 'changed executable edge reaches ambient operation';
  const attrs = rows.flatMap(row => collect([row], 'entry-unsafe', reason));
  const failures = rows.map(row => ({
    identity: row.identity,
    mountedFrom: row.origin,
    reason,
  }));
  validate(rows, attrs, [], failures);
  assert.notEqual(attrs[0].observationKeys[0], attrs[1].observationKeys[0]);
  assert.throws(() => validate(rows, attrs, [], failures.slice(0, 1)), /failure emission exceeds/);
});

test('selected and unselected emissions sharing the exact diagnostic key retain a remainder', () => {
  const row = observation({ incomplete: true, occurrences: 2 });
  const attrs = collect([row], 'entry-incomplete', 'unknown receiver', 2);
  const diagnostics = incomplete(
    { file: row.origin, reason: 'unknown receiver', occurrences: 2 },
    { file: row.origin, reason: 'unknown receiver', occurrences: 5 }
  );
  const original = structuredClone(diagnostics);
  validate([row], attrs, diagnostics, [], ['unknown receiver']);
  assert.deepEqual(describeUnattributedDiagnostics(diagnostics, attrs), [
    {
      diagnosticKey: JSON.stringify([row.origin, 'unknown receiver']),
      indices: [0],
      occurrences: 7,
      attributedOccurrences: 2,
      unattributedOccurrences: 5,
    },
  ]);
  assert.deepEqual(diagnostics, original);
});

test('undefined reasons preserve exact collector normalization without a string/default', () => {
  const row = observation({ incomplete: true });
  const attrs = collect([row], 'entry-incomplete', undefined);
  const diagnostics = incomplete(
    { file: row.origin, reason: undefined },
    { file: row.origin, reason: null }
  );
  assert.equal(Object.hasOwn(attrs[0], 'reason'), true);
  assert.equal(attrs[0].reason, undefined);
  validate([row], attrs, diagnostics);
  assert.equal(describeUnattributedDiagnostics(diagnostics, attrs)[0].unattributedOccurrences, 1);
});

test('empty reason stays empty and is not replaced by the unsafe fallback', () => {
  const row = observation(),
    attrs = collect([row], 'entry-unsafe', '');
  validate(
    [row],
    attrs,
    [],
    [{ identity: row.identity, mountedFrom: row.origin, reason: '' }],
    ['']
  );
});

test('global, adoption, unresolved and duplicate-key rows retain original index spaces', () => {
  const diagnostics = [
    { file: '<analysis>', reason: 'unknown', occurrences: 2 },
    { file: '<adoption-analysis>', reason: 'old unknown', occurrences: 3 },
    { file: 'unobserved.ts', reason: undefined, occurrences: 4 },
    { file: '<analysis>', reason: 'unknown', occurrences: 5 },
  ];
  const groups = describeUnattributedDiagnostics(diagnostics, []);
  assert.deepEqual(
    groups.map(group => group.indices),
    [[0, 3], [1], [2]]
  );
  assert.deepEqual(
    groups.map(group => group.unattributedOccurrences),
    [7, 3, 4]
  );
  assert(groups.every(group => group.attributedOccurrences === 0));
});

test('frame/unknown/escaped/open flags remain in observation keys without becoming evidence of safety', () => {
  const row = observation({
    outcome: 'graph-bound',
    context: 'unknown-frame',
    definingContext: 'unresolved-frame',
    open: true,
    escaped: true,
    dispatchUnknown: ['unknown target'],
  });
  const attrs = collect([row], 'owner-bound', 'graph bound exceeded');
  validate([row], attrs, incomplete({ file: row.origin, reason: 'graph bound exceeded' }));
  for (const field of ['open', 'escaped'])
    assert.notEqual(m4ObservationKey(row), m4ObservationKey({ ...row, [field]: false }));
  assert.equal(attrs[0].context, 'unknown-frame');
  assert.equal(attrs[0].definingContext, 'unresolved-frame');
});

test('safe and provider-boundary observations grant nothing and produce no selected emission', () => {
  const rows = [
    observation({ unsafe: false, receiver: 'tenant-context' }),
    observation({ identity: 'b', outcome: 'provider-boundary' }),
  ];
  validate(rows, [], []);
});

test('empty selected claims still require original diagnostic and failure arrays', () => {
  for (const malformed of [undefined, null, {}, '']) {
    assert.throws(() => validate([], [], malformed), /original emission arrays/);
    assert.throws(
      () =>
        validateM4Attributions({ observations: [], attributions: [] }, new Map(), {
          incomplete: [],
          failures: malformed,
        }),
      /original emission arrays/
    );
  }
  validate([], [], [], []);
});

test('missing, replayed, foreign-frame, wrong-count and excess claims fail', () => {
  const row = observation({ incomplete: true });
  const attrs = collect([row], 'entry-incomplete', 'unknown');
  const diagnostics = incomplete({ file: row.origin, reason: 'unknown' });
  for (const mutate of [
    values => values.pop(),
    values => values.push(structuredClone(values[0])),
    values => {
      values[0].context = 'foreign-frame';
    },
    values => {
      values[0].occurrences++;
    },
    values => {
      values[0].observationKeys[0] = 'f'.repeat(64);
    },
  ]) {
    const changed = structuredClone(attrs);
    mutate(changed);
    assert.throws(
      () => validate([row], changed, diagnostics, [], ['unknown']),
      /M4 emission attribution/
    );
  }
  assert.throws(() => validate([row], attrs, [], [], ['unknown']), /exceeds original key count/);
});

test('a reused collector starts empty without losing frame-distinct keys in later batches', () => {
  const row = observation({ incomplete: true });
  const first = createM4AttributionCollector();
  first.add([row], 'entry-incomplete', 'unknown');
  const second = createM4AttributionCollector();
  assert.deepEqual(second.entries(), []);
  second.add([{ ...row, context: 'unknown-frame' }], 'entry-incomplete', 'unknown');
  assert.notEqual(first.entries()[0].observationKeys[0], second.entries()[0].observationKeys[0]);
});
