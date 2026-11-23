// R-10 history replay, reproduction of the owner pin, and resolver record validation.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { invalidBundlerLinks } from './tenant-guard-bundler-test-cases.mjs';
import {
  initial,
  recordFor,
  refuses,
  scan,
  snapshot,
} from './tenant-guard-schema-test-support.mjs';
import { RESOLVER_BASELINE } from './tenant-guard/resolver-baseline.mjs';
import {
  resolverBaseProblem,
  resolverCandidateProblem,
  resolverPair,
  resolverRecordProblem,
} from './tenant-guard/rules-resolver-state.mjs';
import { sha256 } from './tenant-guard/rules-digest.mjs';
import { reviewedLockBlocks } from './tenant-guard/schema-builder-provenance.mjs';
import { gitIdentity, readSchemaTree, schemaTreeFromBlobs } from './tenant-guard/sources.mjs';

const ROOT = new URL('../../', import.meta.url);
const tree = (commit, role) => readSchemaTree(ROOT, gitIdentity(ROOT, commit), role);

// The last 20 first-parent merges ending at main 54a923f88, each replayed with its own parent as
// the reviewed baseline. Exactly two change the resolver projection; both needed a guard repin when
// they landed (127ebe483 moved the anchor in #2122; 97c989ad6 moved it in #2108), so under R2 each
// would instead have needed a reviewed transition. The other 18 pass unchanged.
const TRIAL = [
  ['54a923f88', '6c21fd6c8', null],
  ['6c21fd6c8', '127ebe483', null],
  ['127ebe483', 'c57163282', 'resolver input changed packages/database/package.json'],
  ['c57163282', '409161a9c', null],
  ['409161a9c', '55304c405', null],
  ['55304c405', 'b3c60c0af', null],
  ['b3c60c0af', '7825acac3', null],
  ['7825acac3', '4098ecb2a', null],
  ['4098ecb2a', '157521558', null],
  ['157521558', 'bab797beb', null],
  ['bab797beb', '10662b908', null],
  ['10662b908', '264049b69', null],
  ['264049b69', '97c989ad6', null],
  ['97c989ad6', '9d4020a3f', 'resolver input changed patches/next@16.4.1.patch'],
  ['9d4020a3f', 'c775e2db6', null],
  ['c775e2db6', 'c7eb76176', null],
  ['c7eb76176', 'dd0522b81', null],
  ['dd0522b81', 'bfb782b11', null],
  ['bfb782b11', 'c51d656dc', null],
  ['c51d656dc', '44033ca8c', null],
];

for (const [merge, parent, expected] of TRIAL) {
  test(`resolver trial ${merge} expects ${expected ?? 'admission'}`, () => {
    const base = tree(parent, 'base');
    const baseline = resolverPair(base);
    assert.equal(baseline.reason, undefined, baseline.reason);
    const record = { baseline, successor: null };
    assert.equal(resolverCandidateProblem(base, tree(merge, 'candidate'), record), expected);
  });
}

test('the pinned resolver baseline reproduces exactly on its recorded main commit', () => {
  const source = fs.readFileSync(
    new URL('./tenant-guard/resolver-baseline.mjs', import.meta.url),
    'utf8'
  );
  const pin = /^\/\/ Baseline: main ([a-f0-9]{40})\.$/mu.exec(source);
  assert.ok(pin, 'expected a full main commit SHA in the baseline header');
  assert.deepEqual(resolverPair(tree(pin[1], 'pinned main')), RESOLVER_BASELINE);
});

const LOCK = 'pnpm-lock.yaml';
const DB_MANIFEST = 'packages/database/package.json';

test('the resolver state hashes the lock projection as a JSON object', () => {
  const lock = "lockfileVersion: '9.0'\n";
  const candidate = schemaTreeFromBlobs(new Map([[LOCK, lock]]));
  const expected = sha256(JSON.stringify([[], reviewedLockBlocks(lock)]));
  assert.equal(resolverPair(candidate).state, `sha256:${expected}`);
});

const image = (target, lockVersion) =>
  schemaTreeFromBlobs(
    new Map([
      [
        'next.config.mjs',
        "import 'next-intl/plugin'; import 'next/constants.js'; export default {};",
      ],
      ['package.json', '{"name":"fixture"}'],
      [DB_MANIFEST, JSON.stringify({ name: '@interdomestik/database', exports: { '.': target } })],
      [LOCK, `lockfileVersion: '${lockVersion}'\n`],
    ])
  );
const base = image('./before.ts', '9.0');
const after = image('./after.ts', '9.1');
const plain = recordFor(base);

const good = recordFor(base, after);
const row = good.successor.files[0];
for (const [label, record, reason] of [
  ['the production default is well formed', undefined, null],
  ['an explicit null record', null, 'resolver record malformed'],
  ['a non-object record', 'x', 'resolver record malformed'],
  ['an extra record key', { ...good, extra: 1 }, 'resolver record malformed'],
  [
    'a malformed state hash',
    { ...plain, baseline: { ...plain.baseline, state: 'x' } },
    'resolver baseline malformed',
  ],
  [
    'a state hash in an array',
    { ...plain, baseline: { ...plain.baseline, state: [plain.baseline.state] } },
    'resolver baseline malformed',
  ],
  [
    'a malformed bundler value',
    { ...plain, baseline: { ...plain.baseline, bundler: { files: [] } } },
    'resolver baseline malformed',
  ],
  [
    'a successor id that is not a slug',
    { ...good, successor: { ...good.successor, id: 'A B' } },
    'resolver successor malformed',
  ],
  [
    'a successor that does not start at the baseline',
    { ...good, successor: { ...good.successor, before: good.successor.after } },
    'resolver successor does not start at the baseline',
  ],
  [
    'a successor that changes nothing',
    { ...good, successor: { ...good.successor, after: good.baseline } },
    'resolver successor changes nothing',
  ],
  [
    'a row whose hashes are equal',
    { ...good, successor: { ...good.successor, files: [{ ...row, after: row.before }] } },
    `resolver successor row ${row.path} is not a change`,
  ],
  [
    'two null hashes',
    { ...good, successor: { ...good.successor, files: [{ ...row, before: null, after: null }] } },
    `resolver successor row ${row.path} is not a change`,
  ],
  [
    'a duplicate row',
    { ...good, successor: { ...good.successor, files: [row, row] } },
    `resolver successor row ${row.path} duplicated`,
  ],
  [
    'a lock row in files',
    { ...good, successor: { ...good.successor, files: [{ ...row, path: LOCK }] } },
    'resolver successor row malformed',
  ],
  [
    'a malformed lock binding',
    { ...good, successor: { ...good.successor, lock: { before: row.after, after: row.after } } },
    'resolver successor lock malformed',
  ],
]) {
  test(`record validation: ${label}`, () => {
    assert.equal(resolverRecordProblem(record), reason);
  });
}

test('record validation refuses non-string ids, hashes and row paths', () => {
  const withSuccessor = change => ({ ...good, successor: { ...good.successor, ...change } });
  for (const id of [null, ['a'], 1])
    assert.equal(resolverRecordProblem(withSuccessor({ id })), 'resolver successor malformed');
  assert.equal(
    resolverRecordProblem(withSuccessor({ files: [{ ...row, after: [row.after] }] })),
    `resolver successor row ${row.path} is not a change`
  );
  assert.equal(
    resolverRecordProblem(withSuccessor({ files: [{ ...row, path: [row.path] }] })),
    'resolver successor row malformed'
  );
  assert.equal(
    resolverRecordProblem(withSuccessor({ lock: { ...good.successor.lock, before: null } })),
    'resolver successor lock malformed'
  );
  const bundled = structuredClone(plain);
  const file = bundled.baseline.bundler.files[0];
  file[1] = [file[1]];
  assert.equal(resolverRecordProblem(bundled), 'resolver baseline malformed');
});

test('record validation requires the exact sorted edge externals and known scope importers', () => {
  const { bundler } = plain.baseline;
  const withBundler = change => ({
    baseline: { ...plain.baseline, bundler: { ...bundler, ...change } },
    successor: null,
  });
  assert.equal(resolverRecordProblem(plain), null);
  for (const externals of [
    [...bundler.externals, 'z-unused'],
    bundler.externals.slice(1),
    bundler.externals.toReversed(),
  ])
    assert.equal(resolverRecordProblem(withBundler({ externals })), 'resolver baseline malformed');
  const [, manifest, fields] = bundler.scopes[0];
  const scopes = [...bundler.scopes, ['unknown.mjs', manifest, fields]];
  assert.equal(resolverRecordProblem(withBundler({ scopes })), 'resolver baseline malformed');
});

test('inconsistent bundler links refuse every record pair and unchanged schema admission', async t => {
  const record = recordFor(initial, snapshot({ [DB_MANIFEST]: after.blobs.get(DB_MANIFEST) }));
  const { successor } = record;
  const { bundler } = successor.after;
  assert.equal(resolverRecordProblem(record), null);
  const withSuccessor = pair => ({ ...record, successor: { ...successor, ...pair } });
  for (const [label, change] of Object.entries(invalidBundlerLinks(bundler))) {
    const malformed = { ...successor.after, bundler: { ...bundler, ...change } };
    const resolverRecord = withSuccessor({ after: malformed });
    const reason = 'resolver successor state malformed';
    await t.test(`${label} in the record`, () => {
      const invalidBaseline = { baseline: malformed, successor: null };
      const invalidBefore = withSuccessor({ before: malformed });
      assert.equal(resolverRecordProblem(invalidBaseline), 'resolver baseline malformed');
      assert.equal(
        resolverRecordProblem(invalidBefore),
        'resolver successor does not start at the baseline'
      );
      assert.equal(resolverRecordProblem(resolverRecord), reason);
    });
    await t.test(`${label} in schema admission`, () => {
      refuses(scan(initial, { resolverRecord }), reason, { c1: false });
    });
  }
});

test('record key order is immaterial to validation, R1 and the R2 edge bindings', () => {
  const reverseObjects = value =>
    JSON.parse(JSON.stringify(value), (_, field) =>
      field && typeof field === 'object' && !Array.isArray(field)
        ? Object.fromEntries(Object.entries(field).reverse())
        : field
    );
  const reordered = reverseObjects(good);
  reordered.successor.before = good.successor.before;
  assert.notDeepEqual(Object.keys(reordered.baseline), Object.keys(good.baseline));
  assert.equal(resolverRecordProblem(reordered), null);
  assert.equal(resolverBaseProblem(base, reordered), null);
  assert.equal(resolverBaseProblem(after, reordered), null);
  assert.equal(resolverCandidateProblem(base, after, reordered), null);
  reordered.successor.after = good.baseline;
  assert.equal(resolverRecordProblem(reordered), 'resolver successor changes nothing');
});

test('the WP-10-shaped edge admits the new imports and promotion keeps binding their bytes', () => {
  const NEXT = 'apps/web/next.config.mjs';
  const helper = 'apps/web/src/lib/pilot-env-refusals.mjs';
  const helperText = 'export const pilotEnvRefusals = (env, name) => env[name];\n';
  const manifest = JSON.parse(initial.blobs.get(DB_MANIFEST));
  manifest.exports['./pilot-switch'] = './src/pilot-switch.ts';
  manifest.exports['./seed-target-classification'] = './src/seed-target-classification.ts';
  const changes = {
    [NEXT]:
      "import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';\n" +
      "import { pilotEnvRefusals } from './src/lib/pilot-env-refusals.mjs';\n" +
      initial.allSources.get(NEXT) +
      '\nexport const fixtureBuildEnv = pilotEnvRefusals(process.env, PHASE_PRODUCTION_BUILD);\n',
    [helper]: helperText,
    [DB_MANIFEST]: JSON.stringify(manifest),
  };
  const next = snapshot(changes);
  const record = recordFor(initial, next);
  const result = scan(next, { resolverRecord: record });
  assert.equal(result.schemaAdmission.ok, true, result.schemaAdmission.reason);
  assert.ok(record.successor.files.some(row => row.path === DB_MANIFEST));
  const spaced = snapshot({ ...changes, [DB_MANIFEST]: `${changes[DB_MANIFEST]}\n` });
  refuses(
    scan(spaced, { resolverRecord: record }),
    `candidate: resolver transition fixture bytes differ for ${DB_MANIFEST}`
  );
  const promoted = { baseline: record.successor.after, successor: null };
  const unchanged = scan(snapshot(changes), { base: next, resolverRecord: promoted });
  assert.equal(unchanged.schemaAdmission.ok, true, unchanged.schemaAdmission.reason);
  refuses(
    scan(snapshot({ ...changes, [helper]: `${helperText} ` }), {
      base: next,
      resolverRecord: promoted,
    }),
    `candidate: bundler closure changed ${helper}`
  );
});
