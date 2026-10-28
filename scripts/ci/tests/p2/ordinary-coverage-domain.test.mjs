import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeOrdinaryCoverage } from '../../p2/ordinary-artifact.mjs';
import {
  validateOrdinaryGeometry,
  reconcileOrdinaryWebSummary,
} from '../../p2/coverage-completeness.mjs';
import {
  ordinaryCoverageSourceClass,
  captureOrdinaryCoverageDataBinding,
  captureOrdinarySignedElseResidual,
} from '../../p2/ordinary-coverage-domain.mjs';
const root = path.resolve(import.meta.dirname, '../../../..');
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
const identity = () => ({
  artifactId: 12808761791,
  runId: 40670095708,
  attempt: 1,
  qualificationPurpose: 'm4-c0',
  digest: 'sha256:27ff228a45d8499f2a713801979c41fcfa3a8e6cc1912e934feb42a18a82a6cf',
  context: {
    candidateCommit: 'c627401bdfa2af1a7ad3ef4b97d53f2d931c9fb6',
    candidateTree: 'd6742aa923b8b34600dec70ff89604a493e0deae',
    headCommit: '3a8936e9b99677b6e77443f3fdcc8d28e4deca19',
  },
});
function temporary(file, body, callback) {
  const candidateRoot = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'p2-coverage-domain-'))
  );
  try {
    const full = path.join(candidateRoot, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body, { mode: 0o644 });
    const trackedSourceEntries = { [file]: { mode: '100644', blob: blob(Buffer.from(body)) } };
    return callback({ file, full, candidateRoot, trackedSourceEntries });
  } finally {
    fs.rmSync(candidateRoot, { recursive: true, force: true });
  }
}
for (const [file, kind] of [
  ['apps/web/src/messages/en/about.json', 'locale-json'],
  ['apps/web/src/messages/sr/about.json', 'locale-json'],
  ['apps/web/src/features/help-now/copy-sq.json', 'help-copy-json'],
  ['apps/web/public/help-now-packs/content-packs.v1.json', 'public-help-json'],
  ['apps/web/e2e/gate/admin-claims-read-projection.fixture.ts', 'e2e-support-typescript'],
])
  test('finite tracked data/support binding ' + kind + ' ' + file, () =>
    temporary(file, kind === 'e2e-support-typescript' ? 'export {};' : '{"copy":"data"}', input => {
      const output = captureOrdinaryCoverageDataBinding(input);
      assert.equal(output.kind, kind);
      assert.equal(output.executionAuthority, false);
      assert.equal(output.nativeCredit, false);
      assert(Object.isFrozen(output));
      const original = row(file);
      const normalized = normalizeOrdinaryCoverage({
        ...input,
        bytes: Buffer.from(JSON.stringify({ [file]: original })),
        allowedSourceFiles: [file],
      });
      assert.deepEqual({ ...normalized[input.full], path: file }, original);
    })
  );
for (const file of [
  'apps/web/src/messages/fr/about.json',
  'apps/web/src/messages/en/unknown.json',
  'apps/web/src/features/help-now/copy-fr.json',
  'apps/web/public/unknown.json',
  'apps/web/e2e/gate/unknown.fixture.ts',
])
  test('unknown finite-domain path refused ' + file, () => {
    assert.equal(ordinaryCoverageSourceClass(file), null);
    assert.throws(() => captureOrdinaryCoverageDataBinding({ file }));
  });
for (const [name, alter] of Object.entries({
  missing: x => delete x.trackedSourceEntries[x.file],
  foreignBlob: x => (x.trackedSourceEntries[x.file].blob = '0'.repeat(40)),
  foreignMode: x => (x.trackedSourceEntries[x.file].mode = '100755'),
  extraGitField: x => (x.trackedSourceEntries[x.file].authority = true),
  changedBytes: x => fs.writeFileSync(x.full, '{}'),
  executablePhysical: x => fs.chmodSync(x.full, 0o755),
  symlink: x => {
    fs.unlinkSync(x.full);
    fs.symlinkSync('/etc/hosts', x.full);
  },
}))
  test('data binding refuses ' + name, () =>
    temporary('apps/web/src/messages/en/about.json', '{"copy":"data"}', input => {
      alter(input);
      assert.throws(() => captureOrdinaryCoverageDataBinding(input));
    })
  );
test('authenticated blob containing invalid JSON remains refused', () =>
  temporary('apps/web/src/messages/en/about.json', 'export default {};', input =>
    assert.throws(() => captureOrdinaryCoverageDataBinding(input))
  ));
test('tracked but unknown JSON does not widen source-domain acceptance', () =>
  temporary('apps/web/src/unknown.json', '{}', input =>
    assert.throws(
      () =>
        normalizeOrdinaryCoverage({
          ...input,
          bytes: Buffer.from(JSON.stringify({ [input.file]: row(input.file) })),
          allowedSourceFiles: [input.file],
        }),
      /foreign coverage path/
    )
  ));
for (const alias of [
  '/apps/web/src/messages/en/about.json',
  'apps/web/src/messages/en/../about.json',
  'apps/web/src/messages/en/./about.json',
  'apps\\web\\src\\messages\\en\\about.json',
])
  test('path alias refused ' + alias, () =>
    assert.throws(
      () =>
        normalizeOrdinaryCoverage({
          bytes: Buffer.from(JSON.stringify({ [alias]: row(alias) })),
          candidateRoot: root,
          allowedSourceFiles: [alias],
        }),
      /foreign coverage path/
    )
  );
const cases = [
  {
    file: 'apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-actions.ts',
    id: '54',
    parent: '107',
    count: 1,
    values: [2, -1],
    line: 435,
    end: 437,
  },
  {
    file: 'apps/web/src/features/claims/components/use-signed-upload-retry.ts',
    id: '8',
    parent: '54',
    count: 26,
    values: [29, -3],
    line: 196,
    end: 209,
  },
];
function residualCase(index = 0, absolute = false) {
  const fixed = cases[index],
    loc = { start: { line: fixed.line, column: 4 }, end: { line: fixed.end, column: null } },
    value = row(absolute ? path.join(root, fixed.file) : fixed.file);
  value.statementMap[fixed.parent] = structuredClone(loc);
  value.s[fixed.parent] = fixed.count;
  value.branchMap[fixed.id] = {
    type: 'if',
    line: fixed.line,
    loc: structuredClone(loc),
    locations: [structuredClone(loc), { start: {}, end: {} }],
  };
  value.b[fixed.id] = [...fixed.values];
  return {
    fixed,
    value,
    context: {
      candidateRoot: root,
      trackedSourceEntries: {
        [fixed.file]: { mode: '100644', blob: blob(fs.readFileSync(path.join(root, fixed.file))) },
      },
      ordinaryArtifactIdentity: identity(),
    },
  };
}
for (const index of [0, 1])
  for (const absolute of [false, true])
    test('exact signed reporter residual preserved ' + index + ' absolute=' + absolute, () => {
      const { fixed, value, context } = residualCase(index, absolute),
        original = structuredClone(value);
      validateOrdinaryGeometry(value, context);
      const data = captureOrdinarySignedElseResidual(value, fixed.id, context);
      assert.deepEqual(value, original);
      assert.deepEqual(data.raw, fixed.values);
      assert.equal(data.residualIsExecutionCount, false);
      assert.equal(data.nativeCredit, false);
      assert.equal(data.hostedCredit, false);
    });
for (const [name, alter] of Object.entries({
  noContext: x => (x.context = {}),
  foreignPath: x => (x.value.path = 'apps/web/src/foreign.ts'),
  foreignId: x => {
    x.value.branchMap[99] = x.value.branchMap[x.fixed.id];
    x.value.b[99] = x.value.b[x.fixed.id];
    delete x.value.branchMap[x.fixed.id];
    delete x.value.b[x.fixed.id];
  },
  foreignType: x => (x.value.branchMap[x.fixed.id].type = 'cond-expr'),
  nonemptyElse: x =>
    (x.value.branchMap[x.fixed.id].locations[1] = structuredClone(
      x.value.branchMap[x.fixed.id].loc
    )),
  differentCount: x => x.value.b[x.fixed.id][1]--,
  fractional: x => (x.value.b[x.fixed.id][1] = -0.5),
  negativeConsequent: x => (x.value.b[x.fixed.id][0] = -2),
  foreignParent: x => x.value.s[x.fixed.parent]++,
  foreignParentLocation: x => x.value.statementMap[x.fixed.parent].start.column++,
  foreignBranchLine: x => x.value.branchMap[x.fixed.id].line++,
  foreignBlob: x => (x.context.trackedSourceEntries[x.fixed.file].blob = '0'.repeat(40)),
  foreignMode: x => (x.context.trackedSourceEntries[x.fixed.file].mode = '100755'),
  foreignArtifact: x => x.context.ordinaryArtifactIdentity.artifactId++,
  foreignDigest: x => (x.context.ordinaryArtifactIdentity.digest = 'sha256:' + '0'.repeat(64)),
  foreignRun: x => x.context.ordinaryArtifactIdentity.runId++,
  foreignAttempt: x => x.context.ordinaryArtifactIdentity.attempt++,
  foreignM: x => (x.context.ordinaryArtifactIdentity.context.candidateCommit = '0'.repeat(40)),
  foreignTree: x => (x.context.ordinaryArtifactIdentity.context.candidateTree = '0'.repeat(40)),
  foreignHead: x => (x.context.ordinaryArtifactIdentity.context.headCommit = '0'.repeat(40)),
  foreignPurpose: x => (x.context.ordinaryArtifactIdentity.qualificationPurpose = 'required'),
}))
  test('signed residual sensitivity ' + name, () => {
    const input = residualCase();
    alter(input);
    assert.throws(() => validateOrdinaryGeometry(input.value, input.context));
  });
const empty = () =>
  Object.fromEntries(
    ['lines', 'statements', 'functions', 'branches'].map(name => [
      name,
      { total: 0, covered: 0, skipped: 0, pct: 0 },
    ])
  );
test('empty metric pct0 representation reconciles without any count or denominator change', () => {
  const file = path.join(root, 'apps/web/src/empty.ts'),
    value = row(file);
  const summary = { total: empty(), 'apps/web/src/empty.ts': empty() };
  const before = structuredClone(summary);
  reconcileOrdinaryWebSummary({ coverage: { [file]: value }, summary, candidateRoot: root });
  assert.deepEqual(summary, before);
});
for (const pct of [1, 99, '0'])
  test('foreign empty pct sentinel refused ' + pct, () => {
    const file = path.join(root, 'apps/web/src/empty.ts'),
      summary = { total: empty(), 'apps/web/src/empty.ts': empty() };
    summary['apps/web/src/empty.ts'].lines.pct = pct;
    assert.throws(() =>
      reconcileOrdinaryWebSummary({ coverage: { [file]: row(file) }, summary, candidateRoot: root })
    );
  });
test('missing denominator row is still refused', () => {
  const file = path.join(root, 'apps/web/src/empty.ts');
  assert.throws(() =>
    reconcileOrdinaryWebSummary({
      coverage: { [file]: row(file) },
      summary: { total: empty() },
      candidateRoot: root,
    })
  );
});
