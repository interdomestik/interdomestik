import assert from 'node:assert/strict';
import test from 'node:test';

import { byCodeUnit } from './server-mutation/ast.mjs';
import {
  coverageShortfall,
  parseBaseline,
  ratchet,
  tamperFindings,
} from './server-mutation/baseline.mjs';
import { CHECKS } from './server-mutation/evaluate.mjs';
import { parseRegistry } from './server-mutation/registry.mjs';
import {
  baselineOf,
  json,
  pageEntry,
  registryOf,
} from './fixtures/server-mutation-check/harness.mjs';

const parse = value =>
  parseBaseline(typeof value === 'string' ? value : json(value), 'head', CHECKS);
const exception = (check, item, kind) => ({
  check,
  item,
  kind,
  approvedBy: 'owner',
  ref: 'PR',
  date: '2026-11-19',
});
const withItems = (id, items, extra = {}) =>
  baselineOf({ [id]: { exhausted: undefined, items, ...extra } });

test('baseline R-10 negative inputs: missing, empty, unparseable, valid-but-empty all refuse', () => {
  assert.throws(() => parseBaseline(null, 'head', CHECKS), /missing or empty/u);
  assert.throws(() => parse('   '), /missing or empty/u);
  assert.throws(() => parse('{ nope'), /not valid JSON/u);
  assert.throws(() => parse({}), /version 1/u);
  // Valid but empty parses here; the CLI refuses a head baseline without its checks (cli test).
  assert.doesNotThrow(() => parse({ version: 1, takenAt: 'x', checks: {}, exceptions: [] }));
  assert.throws(() => parse(withItems('CHK-04', [])), /empty items without exhausted/u);
});

test('baseline schema: unknown mode, unknown check, missing items, duplicates outside multiset checks', () => {
  assert.throws(() => parse(baselineOf({ 'CHK-04': { mode: 'warn' } })), /unknown mode/u);
  assert.throws(
    () =>
      parse({
        ...baselineOf(),
        checks: { ...baselineOf().checks, 'CHK-99': baselineOf().checks['CHK-04'] },
      }),
    /unknown check CHK-99/u
  );
  assert.throws(() => parse(baselineOf({ 'CHK-04': { items: undefined } })), /no items list/u);
  assert.throws(() => parse(withItems('CHK-04', ['a', 'a'])), /duplicate items/u);
  assert.doesNotThrow(() => parse(withItems('CHK-05', ['a', 'a'])));
  assert.throws(
    () =>
      parse({
        ...baselineOf(),
        exceptions: [{ ...exception('CHK-04', 'a', 'added'), approvedBy: 'agent' }],
      }),
    /not approved by the owner/u
  );
});

test('ratchet: new and fixed are multiset differences', () => {
  assert.deepEqual(ratchet(['a', 'a', 'b'], ['a', 'c']), { new: ['a', 'b'], fixed: ['c'] });
  assert.deepEqual(ratchet([], []), { new: [], fixed: [] });
});

test('tamper: added, replaced, downgrade, count and removed check need a fresh owner exception', () => {
  const base = parse(withItems('CHK-04', ['a'], { mode: 'fail', coverageMin: 5 }));
  const changed = withItems('CHK-04', ['a', 'b'], {
    mode: 'report',
    coverageMin: 4,
    unit: 'other',
  });
  assert.deepEqual(tamperFindings('CHK-04', base, parse(changed)).sort(byCodeUnit), [
    'CHK-04#added:b',
    'CHK-04#changed-unit',
    'CHK-04#downgrade',
    'CHK-04#lowered-coverageMin',
  ]);
  const approved = {
    ...changed,
    exceptions: [
      exception('CHK-04', 'b', 'added'),
      exception('CHK-04', '#unit', 'replaced'),
      exception('CHK-04', '#mode', 'downgrade'),
      exception('CHK-04', '#coverageMin', 'count'),
    ],
  };
  assert.deepEqual(tamperFindings('CHK-04', base, parse(approved)), []);
  const removed = parse(baselineOf());
  delete removed.checks['CHK-04'];
  assert.deepEqual(tamperFindings('CHK-04', base, removed), ['CHK-04#removed-check']);
});

test('tamper: an exception already in the base is spent and admits nothing new', () => {
  const spent = [exception('CHK-04', 'b', 'added')];
  const base = parse({ ...withItems('CHK-04', ['a']), exceptions: spent });
  const head = parse({ ...withItems('CHK-04', ['a', 'b']), exceptions: spent });
  assert.deepEqual(tamperFindings('CHK-04', base, head), ['CHK-04#added:b']);
});

test('tamper: shrinking items, raising coverage and the bootstrap (no base) are clean', () => {
  const base = parse(withItems('CHK-04', ['a', 'b'], { coverageMin: 3 }));
  assert.deepEqual(
    tamperFindings('CHK-04', base, parse(withItems('CHK-04', ['a'], { coverageMin: 9 }))),
    []
  );
  assert.deepEqual(tamperFindings('CHK-04', null, parse(withItems('CHK-04', ['z']))), []);
});

test('coverage minima: per check or per kind', () => {
  assert.deepEqual(coverageShortfall(10, 10), []);
  assert.deepEqual(coverageShortfall(9, 10), ['*: 9 < 10']);
  assert.deepEqual(coverageShortfall({ route: 3, page: 1 }, { route: 3, page: 2 }), [
    'page: 1 < 2',
  ]);
});

test('registry R-10 negative inputs and schema', () => {
  assert.throws(() => parseRegistry(''), /missing or empty/u);
  assert.throws(() => parseRegistry('{'), /not valid JSON/u);
  assert.throws(() => parseRegistry(json(registryOf([]))), /no entries/u);
  const page = pageEntry('home', 'apps/web/src/app/page.tsx');
  assert.doesNotThrow(() => parseRegistry(json(registryOf([page]))));
  assert.throws(() => parseRegistry(json(registryOf([page, page]))), /duplicate id/u);
  assert.throws(
    () => parseRegistry(json(registryOf([{ ...page, closedBy: { setting: 'x' } }]))),
    /closedBy must be null/u
  );
  assert.throws(
    () => parseRegistry(json(registryOf([{ ...page, extra: 1 }]))),
    /unknown key extra/u
  );
  const route = {
    id: 'r',
    kind: 'route',
    module: 'apps/web/src/app/api/x/route.ts',
    method: 'POST',
    authentication: 'cookie',
    effect: 'e',
    deniedTest: { path: 'p', title: 't' },
    writes: true,
    closedBy: null,
    source: 's',
  };
  assert.throws(() => parseRegistry(json(registryOf([route]))), /unknown authentication label/u);
  const action = {
    id: 'a',
    kind: 'server-action',
    module: 'm',
    export: 'x',
    operation: 'op',
    rateLimit: { limit: 0, windowSeconds: 60 },
    writes: true,
    closedBy: null,
    source: 's',
  };
  assert.throws(
    () => parseRegistry(json(registryOf([action]))),
    /rateLimit needs positive integer/u
  );
});
