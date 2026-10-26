import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { classifyDefaultEmailEquivalence } from './db-access-default-email-equivalence.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = process.env.DEFAULT_EMAIL_EQ_TEST_REPO ?? path.resolve(here, '../..');
const policy = JSON.parse(
  fs.readFileSync(path.join(here, 'db-access-default-email-equivalence-policy.json'))
);
const clone = value => structuredClone(value);
const schemaFixture = JSON.parse(
  fs.readFileSync(path.join(here, 'db-access-default-email-schema-fixture.json'))
);
const sha = source => createHash('sha256').update(source).digest('hex');
for (const kind of ['qualified', 'unqualified'])
  assert.equal(sha(schemaFixture[kind].source), schemaFixture[kind].sha256);
assert.equal(
  schemaFixture.qualified.sha256,
  policy.files.find(item => item.file === schemaFixture.file).currentSha256
);
function fixture() {
  const rows = clone(policy.operations.map(item => item.row));
  const dependencies = new Map(
    policy.dependencies.map(([file, targets]) => [file, new Set(targets)])
  );
  const sources = new Map(
    policy.files.map(item => [
      item.file,
      // This positive observation belongs to the fixed old contract. A later schema export
      // remains unqualified in production and is an explicit negative immediately below.
      item.file === schemaFixture.file
        ? schemaFixture.qualified.source
        : fs.readFileSync(path.join(repo, item.file), 'utf8'),
    ])
  );
  // The fixture reconstructs exact ADOPTION source bytes from the authenticated observation's
  // matching source or Git. Production obtains these only through authenticateSnapshot.
  const trusted = new Map();
  for (const item of policy.files)
    if (item.adoptionSha256 !== null)
      trusted.set(item.file, item.sameBytes ? sources.get(item.file) : execGitSource(item.file));
  const prepared = {
    adoption: { commit: policy.adoptionCommit, tree: policy.adoptionTree },
    baselineBytes: fs.readFileSync(path.join(repo, 'scripts/ci/db-access-baseline.json')),
    sources,
    trusted,
    moduleTargets: { dependencies },
    providerFiles: new Set(
      policy.files.filter(item => item.providerBoundary).map(item => item.file)
    ),
    inventory: { entries: rows, changed: new Set(policy.roots.map(item => item.file)) },
  };
  const graph = { failures: [], incomplete: [{ reason: 'unresolved diagnostics remain held' }] };
  for (const item of policy.operations) {
    for (const root of item.observedMounts)
      graph.failures.push({
        ...clone(item.row),
        mountedFrom: root,
        reason: item.row.reason ?? 'changed executable edge reaches ambient operation',
      });
  }
  const failures = new Map(
    rows.map(row => [
      row.identity,
      {
        ...clone(row),
        reason:
          'existing scoped executable controls changed; root epoch cannot certify equivalence',
      },
    ])
  );
  failures.set('unrelated', { identity: 'unrelated', reason: 'must remain failed' });
  return { prepared, graph, failures };
}
import { execFileSync } from 'node:child_process';
const execGitSource = file =>
  execFileSync('git', ['show', policy.adoptionCommit + ':' + file], {
    cwd: repo,
    encoding: 'utf8',
  });
test('exact finite source proof removes only eight failures while retaining full observations and debt', () => {
  const f = fixture();
  const snapshot = () =>
    JSON.stringify({ prepared: f.prepared, graph: f.graph }, (_key, value) =>
      value instanceof Map || value instanceof Set ? [...value] : value
    );
  const before = snapshot();
  const result = classifyDefaultEmailEquivalence(f.prepared, f.graph, f.failures);
  assert.equal(result.status, 'classified');
  assert.equal(result.operations.length, 8);
  assert.equal(result.runtimeAdmission, false);
  assert.deepEqual([...f.failures.keys()], ['unrelated']);
  assert.equal(snapshot(), before);
  assert.ok(f.prepared.inventory.entries.every(entry => entry.historicalDebt === false));
});
test('the real later schema export remains held without removing any failure', () => {
  const f = fixture();
  f.prepared.sources.set(schemaFixture.file, schemaFixture.unqualified.source);
  const before = JSON.stringify([...f.failures]);
  const result = classifyDefaultEmailEquivalence(f.prepared, f.graph, f.failures);
  assert.equal(result.status, 'held');
  assert.equal(result.reason, 'source binding changed: ' + schemaFixture.file);
  assert.equal(JSON.stringify([...f.failures]), before);
  assert.deepEqual(result.operations, []);
  assert.equal(result.runtimeAdmission, false);
});
const negatives = [
  ['changed own core', f => f.prepared.sources.set(policy.operations[0].row.file, 'changed core')],
  [
    'changed email leaf',
    f =>
      f.prepared.sources.set(
        'packages/domain-communications/src/sign-in-otp-email.ts',
        'changed leaf'
      ),
  ],
  [
    'changed cron auth dependency',
    f => f.prepared.sources.set('apps/web/src/app/api/cron/_auth.ts', 'changed authorization'),
  ],
  [
    'changed original snapshot',
    f => f.prepared.trusted.set(policy.operations[0].row.file, 'foreign original'),
  ],
  [
    'changed baseline',
    f => {
      f.prepared.baselineBytes = Buffer.from('changed baseline');
    },
  ],
  [
    'new resolver target',
    f =>
      f.prepared.moduleTargets.dependencies
        .get(policy.roots[0].file)
        .add('apps/web/src/new-competing-target.ts'),
  ],
  [
    'removed dependency',
    f => f.prepared.moduleTargets.dependencies.get(policy.roots[0].file).clear(),
  ],
  [
    'expanded provider trust',
    f => f.prepared.providerFiles.add('packages/domain-communications/src/email.ts'),
  ],
  [
    'foreign mounted root',
    f =>
      f.graph.failures.push({
        ...f.graph.failures[0],
        mountedFrom: 'apps/web/src/new-consumer.ts',
      }),
  ],
  [
    'new graph failure reason',
    f => {
      f.graph.failures[0].reason = 'new unproved failure';
    },
  ],
  [
    'changed scoped failure reason',
    f => {
      f.failures.get(policy.operations[0].row.identity).reason = 'new unproved failure';
    },
  ],
  ['missing failure', f => f.failures.delete(policy.operations[0].row.identity)],
  [
    'changed classification',
    f => {
      f.prepared.inventory.entries[0].tenantPosture = 'tenant-context';
    },
  ],
  [
    'extra operation',
    f =>
      f.prepared.inventory.entries.push({
        ...f.prepared.inventory.entries[0],
        identity: 'new operation',
      }),
  ],
  [
    'duplicate operation',
    f => {
      f.prepared.inventory.entries[1] = f.prepared.inventory.entries[0];
    },
  ],
];
for (const [label, mutate] of negatives)
  test(label + ' holds entire bundle and preserves verdict map', () => {
    const f = fixture();
    mutate(f);
    const before = clone(f.failures);
    const result = classifyDefaultEmailEquivalence(f.prepared, f.graph, f.failures);
    assert.equal(result.status, 'held', JSON.stringify(result));
    assert.equal(result.operations.length, 0);
    assert.deepEqual(f.failures, before);
  });
test('different adoption fixture gains no precision', () => {
  const f = fixture(),
    before = clone(f.failures);
  f.prepared.adoption.commit = '0'.repeat(40);
  assert.equal(
    classifyDefaultEmailEquivalence(f.prepared, f.graph, f.failures).status,
    'not-applicable'
  );
  assert.deepEqual(f.failures, before);
});
