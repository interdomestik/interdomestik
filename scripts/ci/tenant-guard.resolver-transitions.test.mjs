// The reviewed resolver state: R1 (the base is reviewed), R2 (the candidate keeps it or crosses the
// one exact owner-pinned transition).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assignedEnvConfig, computedEnvConfig } from './tenant-guard-bundler-test-cases.mjs';
import {
  initial,
  recordFor,
  refuses,
  scan,
  snapshot,
} from './tenant-guard-schema-test-support.mjs';
import {
  resolverBaseProblem,
  resolverCandidateProblem,
  resolverPair,
  resolverRecordProblem,
  resolverTransition,
} from './tenant-guard/rules-resolver-state.mjs';
import { sha256 } from './tenant-guard/rules-digest.mjs';
import { schemaTreeFromBlobs } from './tenant-guard/sources.mjs';

const NEXT = 'apps/web/next.config.mjs';
const A = 'apps/web/src/lib/a.mjs';
const B = 'apps/web/src/lib/b.mjs';
const MANIFEST = 'apps/web/package.json';
const DB_MANIFEST = 'packages/database/package.json';
const LOCK = 'pnpm-lock.yaml';
const lock = version => `lockfileVersion: '${version}'\n\nimporters:\n\n  .: {}\n`;
const fixture = {
  [MANIFEST]: JSON.stringify({ name: '@interdomestik/web', scripts: { build: 'next build' } }),
  [DB_MANIFEST]: JSON.stringify({ name: '@interdomestik/database', exports: { '.': './a.ts' } }),
  [NEXT]: "import { a } from './src/lib/a.mjs';\nexport default { env: { A: a } };\n",
  [A]: "import { b } from './b.mjs';\nexport const a = b;\n",
  [B]: 'export const b = 1;\n',
  [LOCK]: lock('9.0'),
};
const image = (changes = {}) =>
  schemaTreeFromBlobs(
    new Map(Object.entries({ ...fixture, ...changes }).filter(([, text]) => text !== null))
  );
const base = image();
const plain = recordFor(base);
const withExports = image({
  [DB_MANIFEST]: JSON.stringify({ name: '@interdomestik/database', exports: { '.': './b.ts' } }),
});

test('R1 admits the baseline and the successor after-state, and nothing else', () => {
  assert.equal(resolverBaseProblem(base, plain), null);
  assert.equal(
    resolverBaseProblem(withExports, plain),
    'resolver state is not the reviewed baseline'
  );
  assert.equal(resolverBaseProblem(withExports, recordFor(base, withExports)), null);
  assert.match(resolverBaseProblem(image({ [A]: 'require(1);\n' }), plain), /unbindable/u);
});

test('R2 admits an unchanged state and projection-neutral manifest edits', () => {
  assert.equal(resolverCandidateProblem(base, base, plain), null);
  const scripts = image({
    [MANIFEST]: JSON.stringify({ name: '@interdomestik/web', scripts: { build: 'next' } }),
  });
  assert.equal(resolverCandidateProblem(base, scripts, plain), null);
  assert.equal(resolverCandidateProblem(base, image({ 'README.md': 'x' }), plain), null);
});

test('R2 refuses an unreviewed projection, lock or bundler change by its first path', () => {
  assert.equal(
    resolverCandidateProblem(base, withExports, plain),
    `resolver input changed ${DB_MANIFEST}`
  );
  assert.equal(
    resolverCandidateProblem(base, image({ [LOCK]: lock('9.1') }), plain),
    'unreviewed Drizzle lock resolution'
  );
  assert.equal(
    resolverCandidateProblem(base, image({ [B]: 'export const b = 2;\n' }), plain),
    `bundler closure changed ${B}`
  );
});

test('a difference already on the base is never attributed to the PR', () => {
  const record = recordFor(base, withExports);
  assert.equal(resolverBaseProblem(withExports, record), null);
  assert.equal(resolverCandidateProblem(withExports, withExports, record), null);
  const later = image({
    [DB_MANIFEST]: JSON.stringify({ name: '@interdomestik/database', exports: { '.': './b.ts' } }),
    'README.md': 'later',
  });
  assert.equal(resolverCandidateProblem(withExports, later, record), null);
});

test('R2 admits only the exact transition, with raw bytes bound on both trees', () => {
  const record = recordFor(base, withExports);
  assert.equal(resolverCandidateProblem(base, withExports, record), null);
  const spaced = image({
    [DB_MANIFEST]: JSON.stringify(
      { name: '@interdomestik/database', exports: { '.': './b.ts' } },
      null,
      2
    ),
  });
  assert.deepEqual(resolverPair(spaced), resolverPair(withExports));
  assert.equal(
    resolverCandidateProblem(base, spaced, record),
    `resolver transition fixture bytes differ for ${DB_MANIFEST}`
  );
  const otherBase = image({ 'README.md': 'x', [MANIFEST]: `${fixture[MANIFEST]} ` });
  assert.equal(resolverCandidateProblem(otherBase, withExports, record), null);
  const spacedBase = image({
    [DB_MANIFEST]: JSON.stringify(JSON.parse(fixture[DB_MANIFEST]), null, 2),
  });
  assert.deepEqual(resolverPair(spacedBase), resolverPair(base));
  assert.equal(
    resolverCandidateProblem(spacedBase, withExports, record),
    `resolver transition fixture bytes differ for ${DB_MANIFEST}`
  );
  assert.equal(
    resolverCandidateProblem(base, image({ [B]: 'export const b = 3;\n' }), record),
    `bundler closure changed ${B}`
  );
});

test('a transition that changes the lock projection binds both raw lock files', () => {
  const next = image({ [LOCK]: lock('9.1') });
  const record = recordFor(base, next);
  assert.equal(record.successor.lock.after.length, 71);
  assert.equal(resolverCandidateProblem(base, next, record), null);
  const reordered = image({ [LOCK]: `${lock('9.1')}\n` });
  assert.deepEqual(resolverPair(reordered), resolverPair(next));
  assert.equal(
    resolverCandidateProblem(base, reordered, record),
    `resolver transition fixture bytes differ for ${LOCK}`
  );
  const unbound = { ...record, successor: { ...record.successor, lock: null } };
  assert.equal(
    resolverCandidateProblem(base, next, unbound),
    'resolver transition fixture lock binding mismatch'
  );
});

test('a scope-record change binds the edited manifest', () => {
  const typed = image({
    [MANIFEST]: JSON.stringify({ name: '@interdomestik/web', type: 'module', scripts: {} }),
  });
  const record = recordFor(base, typed);
  assert.deepEqual(
    record.successor.files.map(row => row.path),
    [MANIFEST]
  );
  const spaced = image({
    [MANIFEST]: JSON.stringify(
      { name: '@interdomestik/web', type: 'module', scripts: {} },
      null,
      1
    ),
  });
  assert.match(resolverCandidateProblem(base, spaced, record), /bytes differ for apps\/web/u);
});

test('renaming a transitive importer only needs a row if the scoped manifest bytes change', () => {
  const helper = `import 'next-axiom';\n${fixture[B]}`;
  const before = image({ [B]: helper });
  const C = 'apps/web/src/lib/c.mjs';
  const changes = { [B]: null, [C]: helper, [A]: fixture[A].replace('b.mjs', 'c.mjs') };
  const renamed = image(changes);
  const rename = recordFor(before, renamed);
  assert.equal(before.blobs.get(NEXT), renamed.blobs.get(NEXT));
  assert.ok(
    rename.baseline.bundler.edges.some(
      ([importer, , target]) => importer === B && target === 'external:next-axiom'
    )
  );
  assert.deepEqual(rename.successor.files, []);
  assert.equal(resolverCandidateProblem(before, renamed, rename), null);
  const renamedAndEdited = image({ ...changes, [MANIFEST]: `${fixture[MANIFEST]}\n` });
  assert.equal(
    resolverCandidateProblem(before, renamedAndEdited, rename),
    'resolver transition fixture does not list the changed paths'
  );
  const withManifest = recordFor(before, renamedAndEdited);
  assert.deepEqual(
    withManifest.successor.files.map(row => row.path),
    [MANIFEST]
  );
  assert.equal(resolverCandidateProblem(before, renamedAndEdited, withManifest), null);
});

test('the transition is admitted only from the exact baseline', () => {
  const record = recordFor(base, withExports);
  const drifted = image({ [B]: 'export const b = 7;\n' });
  assert.equal(resolverBaseProblem(drifted, record), 'resolver state is not the reviewed baseline');
  const candidate = image({
    [B]: 'export const b = 7;\n',
    [DB_MANIFEST]: withExports.blobs.get(DB_MANIFEST),
  });
  assert.equal(
    resolverCandidateProblem(drifted, candidate, record),
    `resolver input changed ${DB_MANIFEST}`
  );
});

test('a malformed record refuses schema admission on every run, before any tree is judged', () => {
  const malformed = { ...recordFor(initial), extra: true };
  refuses(scan(initial, { resolverRecord: malformed }), 'resolver record malformed', { c1: false });
});

test('the record generator reproduces a transition exactly from two trees', () => {
  const transition = resolverTransition(base, withExports, 'fixture');
  assert.deepEqual(Object.keys(transition), ['id', 'before', 'after', 'files', 'lock']);
  assert.deepEqual(transition.files, [
    {
      path: DB_MANIFEST,
      before: `sha256:${sha256(fixture[DB_MANIFEST])}`,
      after: `sha256:${sha256(withExports.blobs.get(DB_MANIFEST))}`,
    },
  ]);
  assert.equal(transition.lock, null);
  assert.match(resolverTransition(image({ [A]: 'eval(1);\n' }), base, 'x').reason, /unbindable/u);
});

for (const [form, config] of [
  ['definition', computedEnvConfig],
  ['assignment', assignedEnvConfig],
]) {
  test(`R2(b) admits a generated transition for a computed environment key ${form}`, () => {
    const candidate = snapshot({ [NEXT]: config });
    const record = recordFor(initial, candidate);
    const result = scan(candidate, { resolverRecord: record });
    assert.equal(result.schemaAdmission.ok, true, result.schemaAdmission.reason);
  });
}

test('record validation admits a transitive cycle reachable from a config root', () => {
  const candidate = image({ [B]: `import './a.mjs';\n${fixture[B]}` });
  assert.equal(resolverRecordProblem(recordFor(base, candidate)), null);
});

test('the record generator refuses to print a no-op successor for a real commit', () => {
  const script = fileURLToPath(new URL('./tenant-guard-resolver-record.mjs', import.meta.url));
  const commit = '8589d187e';
  const args = [script, commit, '--successor', commit, '--id', 'fixture'];
  const result = spawnSync(process.execPath, args, {
    cwd: new URL('../../', import.meta.url),
    encoding: 'utf8',
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /resolver successor changes nothing/u);
});

// End to end through schema admission (the replaced trusted-bytes bundler rule, now on the
// authenticated images): an unchanged config passes; a changed or added config refuses.
test('schema admission refuses a changed or added bundler config on the candidate', () => {
  assert.equal(scan(initial).schemaAdmission.ok, true, scan(initial).schemaAdmission.reason);
  const config = initial.allSources.get(NEXT);
  const alias = `${config}\nexport const webpack = c => ({ ...c, resolve: { alias: { x: '../../packages/database/src/db.ts' } } });\n`;
  refuses(scan(snapshot({ [NEXT]: alias })), `candidate: resolver input changed ${NEXT}`);
  const helper = 'apps/web/src/lib/supabase-deployment.mjs';
  refuses(
    scan(snapshot({ [helper]: `${initial.allSources.get(helper)}\n` })),
    `candidate: bundler closure changed ${helper}`
  );
  refuses(
    scan(
      snapshot({
        [helper]: `${initial.allSources.get(helper)}\nconst load = name => import(name);\n`,
      })
    ),
    `candidate: unbindable bundler closure: dynamic import in ${helper}`
  );
  refuses(
    scan(snapshot({ 'apps/web/next.config.ts': 'export default {};\n' })),
    'candidate: unbindable bundler closure: non-module closure file apps/web/next.config.ts'
  );
  refuses(
    scan(initial, { base: snapshot({ [NEXT]: alias }), resolverRecord: recordFor(initial) }),
    'base: resolver state is not the reviewed baseline'
  );
});

test('an unrelated config under a generated directory leaves B and admission unchanged', () => {
  const candidate = snapshot({ 'tools/fixtures/dist/next.config.mjs': 'export default {};\n' });
  const record = recordFor(initial);
  assert.deepEqual(resolverPair(candidate).bundler, record.baseline.bundler);
  const result = scan(candidate, { resolverRecord: record });
  assert.equal(result.schemaAdmission.ok, true, result.schemaAdmission.reason);
});
