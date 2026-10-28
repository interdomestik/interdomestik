import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { convertP2Coverage, mergeP2Coverage } from '../../p2/coverage-adapter.mjs';
const repo = path.resolve(import.meta.dirname, '../../../..');
const read = name => fs.readFileSync(path.join(repo, 'scripts/ci/p2', name), 'utf8');
const blob = bytes =>
  createHash('sha1')
    .update('blob ' + bytes.length + '\0')
    .update(bytes)
    .digest('hex');
const row = file => ({
  path: file,
  statementMap: {},
  fnMap: {},
  branchMap: {},
  s: {},
  f: {},
  b: {},
});
async function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p2-full-pipeline-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const p2 = await convertP2Coverage({
    observation: JSON.parse(
      fs.readFileSync(new URL('./dist/local-coverage-observation.json', import.meta.url))
    ),
    generatedJs: read('capsule/dist/wrapper.mjs'),
    generatedTs: read('capsule/dist/wrapper.source.ts'),
    sourceMap: JSON.parse(read('capsule/dist/wrapper.js.map')),
    originalSource: read('capsule/dist/wrapper.original.ts'),
    retainedSegments: JSON.parse(read('dist/source-manifest.json')).retainedSegments,
    originalPath: path.join(
      root,
      'apps/web/src/server/operations/m4-qualification-admin-assignment.ts'
    ),
  });
  return { root, p2, trackedSourceEntries: {}, counter: 0 };
}
function source(f, file, body = '{}\n') {
  const full = path.join(f.root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, { mode: 0o644 });
  f.trackedSourceEntries[file] = { mode: '100644', blob: blob(Buffer.from(body)) };
  return row(full);
}
function merge(f, ambient, extra = {}) {
  return mergeP2Coverage({
    ambientCoverage: ambient,
    p2Coverage: f.p2,
    trackedSourceEntries: f.trackedSourceEntries,
    outputDirectory: path.join(f.root, 'out-' + f.counter++),
    ...extra,
  });
}
function signed(f) {
  const name = 'apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-actions.ts',
    value = source(f, name, fs.readFileSync(path.join(repo, name), 'utf8')),
    loc = { start: { line: 435, column: 4 }, end: { line: 437, column: null } };
  value.statementMap[107] = structuredClone(loc);
  value.s[107] = 1;
  value.branchMap[54] = {
    type: 'if',
    line: 435,
    loc: structuredClone(loc),
    locations: [structuredClone(loc), { start: {}, end: {} }],
  };
  value.b[54] = [2, -1];
  return value;
}
const identity = () => ({
  qualificationPurpose: 'm4-c0',
  artifactId: 12808761791,
  runId: 40670095708,
  attempt: 1,
  digest: 'sha256:27ff228a45d8499f2a713801979c41fcfa3a8e6cc1912e934feb42a18a82a6cf',
  context: {
    candidateCommit: 'c627401bdfa2af1a7ad3ef4b97d53f2d931c9fb6',
    candidateTree: 'd6742aa923b8b34600dec70ff89604a493e0deae',
    headCommit: '3a8936e9b99677b6e77443f3fdcc8d28e4deca19',
  },
});
test('merge accepts only the authenticated finite JSON/support domain and preserves all non-target rows', async t => {
  const f = await fixture(t),
    rows = [
      source(f, 'apps/web/src/messages/en/about.json'),
      source(f, 'apps/web/e2e/gate/admin-claims-read-result.fixture.ts', 'export {};'),
      source(f, 'apps/web/src/app/[...all]/page.ts', 'export {};'),
    ],
    ambient = Object.fromEntries(rows.map(value => [value.path, value]));
  const before = structuredClone(ambient),
    result = merge(f, ambient, { candidateRoot: '/caller-cannot-select-root' });
  for (const value of rows) assert.deepEqual(result.coverageMap[value.path], before[value.path]);
  assert(result.files.every(file => file.startsWith(f.root + '/')));
  assert(fs.existsSync(path.join(result.outputDirectory, 'coverage-final.json')));
  assert(fs.existsSync(path.join(result.outputDirectory, 'coverage-summary.json')));
  assert(fs.existsSync(path.join(result.outputDirectory, 'lcov.info')));
  assert(fs.existsSync(path.join(result.outputDirectory, 'index.html')));
  assert.equal(result.runtimeAdmission, false);
  assert.equal(result.proofMinted, false);
});
for (const file of [
  'apps/web/src/unknown.json',
  'apps/web/public/unknown.json',
  'packages/foreign.ts',
])
  test('merge refuses unknown data/support/repository path ' + file, async t => {
    const f = await fixture(t),
      value = source(f, file);
    assert.throws(() => merge(f, { [value.path]: value }), /outside fixed repository/);
  });
test('merge refuses canonical alias segments without rejecting literal catch-all route names', async t => {
  const f = await fixture(t),
    file = f.root + '/apps/web/src/../src/alias.ts';
  assert.throws(() => merge(f, { [file]: row(file) }), /outside fixed repository/);
});
for (const kind of ['missing', 'hash', 'mode', 'symlink'])
  test('merge refuses supplemental source binding ' + kind, async t => {
    const f = await fixture(t),
      value = source(f, 'apps/web/src/messages/en/about.json');
    if (kind === 'missing') delete f.trackedSourceEntries['apps/web/src/messages/en/about.json'];
    if (kind === 'hash')
      f.trackedSourceEntries['apps/web/src/messages/en/about.json'].blob = '0'.repeat(40);
    if (kind === 'mode')
      f.trackedSourceEntries['apps/web/src/messages/en/about.json'].mode = '100755';
    if (kind === 'symlink') {
      fs.unlinkSync(value.path);
      fs.symlinkSync('/etc/hosts', value.path);
    }
    assert.throws(() => merge(f, { [value.path]: value }));
  });
test('signed reporter residual remains raw through both merge calls and needs context each time', async t => {
  const f = await fixture(t),
    value = signed(f),
    ambient = { [value.path]: value },
    before = structuredClone(value);
  assert.throws(() => merge(f, ambient));
  const first = merge(f, ambient, { ordinaryArtifactIdentity: identity() });
  assert.deepEqual(first.coverageMap[value.path], before);
  assert.deepEqual(first.coverageMap[value.path].b[54], [2, -1]);
  assert.throws(() => merge(f, first.coverageMap));
  const second = merge(f, first.coverageMap, { ordinaryArtifactIdentity: identity() });
  assert.deepEqual(second.coverageMap[value.path], before);
});
for (const mutation of ['artifact', 'counter', 'parent', 'geometry'])
  test('merge keeps exact signed-residual refusal ' + mutation, async t => {
    const f = await fixture(t),
      value = signed(f),
      id = identity();
    if (mutation === 'artifact') id.artifactId++;
    if (mutation === 'counter') value.b[54][1] = -2;
    if (mutation === 'parent') value.s[107] = 2;
    if (mutation === 'geometry')
      value.branchMap[54].locations[1] = structuredClone(value.branchMap[54].loc);
    assert.throws(() => merge(f, { [value.path]: value }, { ordinaryArtifactIdentity: id }));
  });
test('only genuine in-process pure conversion brand enters merge, never a DTO or clone', async t => {
  const f = await fixture(t);
  for (const fake of [{}, structuredClone(f.p2), JSON.parse(JSON.stringify(f.p2))])
    assert.throws(() => merge(f, {}, { p2Coverage: fake }), /converted in this process/);
});
test('ambient target counters cannot contribute and target denominator cannot be swapped', async t => {
  const f = await fixture(t),
    target = f.p2.originalPath,
    actual = JSON.parse(JSON.stringify(f.p2.coverageMap[target])),
    fake = structuredClone(actual);
  for (const id in fake.s) fake.s[id] = 999;
  for (const id in fake.f) fake.f[id] = 999;
  for (const id in fake.b) fake.b[id] = fake.b[id].map(() => 999);
  const result = merge(f, { [target]: fake });
  assert.deepEqual(result.coverageMap[target], actual);
  const bad = structuredClone(actual),
    id = Object.keys(bad.statementMap)[0];
  delete bad.statementMap[id];
  delete bad.s[id];
  assert.throws(() => merge(f, { [target]: bad }), /denominator mismatch/);
});
test('actual dispatch forwards the same fixed M/artifact context to normalization and BOTH merge callsites', () => {
  const source = fs.readFileSync(path.join(repo, 'scripts/ci/p2/ordinary-dispatch.mjs'), 'utf8'),
    unit = ts.createSourceFile(
      'dispatch.mjs',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS
    ),
    calls = [];
  let context;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(unit) === 'coverageContext')
      context = node.initializer;
    if (ts.isCallExpression(node) && node.expression.getText(unit) === 'mergeP2Coverage')
      calls.push(node);
    ts.forEachChild(node, visit);
  }
  visit(unit);
  assert(ts.isObjectLiteralExpression(context));
  assert.deepEqual(
    context.properties.map(p => [
      p.name.getText(unit),
      (ts.isShorthandPropertyAssignment(p) ? p.name : p.initializer).getText(unit),
    ]),
    [
      ['trackedSourceEntries', 'trackedSourceEntries'],
      ['ordinaryArtifactIdentity', 'identity'],
    ]
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map(call =>
      call.arguments[0].properties
        .find(p => p.name?.getText(unit) === 'ambientCoverage')
        .initializer.getText(unit)
    ),
    ['ordinary', 'originalFactoryMerged.coverageMap']
  );
  for (const call of calls)
    assert.equal(
      call.arguments[0].properties.filter(
        p => ts.isSpreadAssignment(p) && p.expression.getText(unit) === 'coverageContext'
      ).length,
      1
    );
  assert(source.includes('minLinesPct: 60'));
  const adapter = fs.readFileSync(path.join(repo, 'scripts/ci/p2/coverage-adapter.mjs'), 'utf8');
  assert(adapter.includes('const candidateRoot = convertedRoots.get(p2Coverage)'));
});
