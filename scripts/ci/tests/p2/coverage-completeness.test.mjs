import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { libCoverage } from '../../p2/libraries.mjs';
import {
  reconcileOrdinaryWebSummary,
  validateOrdinaryGeometry,
} from '../../p2/coverage-completeness.mjs';
import { expectedCoverageFiles } from '../../p2/ordinary-artifact.mjs';
import { convertP2Coverage, mergeP2Coverage } from '../../p2/coverage-adapter.mjs';
import { runCoverageGate } from '../../coverage-gate.mjs';

const q = new URL('../../p2/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, q), 'utf8');
const bytes = value => Buffer.from(JSON.stringify(value));
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p2-completeness-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function row(file, length = 100, hits = 0) {
  const statementMap = {},
    s = {};
  for (let id = 0; id < length; id++) {
    statementMap[id] = { start: { line: id + 1, column: 0 }, end: { line: id + 1, column: 1 } };
    s[id] = hits;
  }
  return { path: file, statementMap, fnMap: {}, branchMap: {}, s, f: {}, b: {} };
}
function summary(coverage, root) {
  const map = libCoverage.createCoverageMap(coverage);
  return {
    total: map.getCoverageSummary().toJSON(),
    ...Object.fromEntries(
      map
        .files()
        .map(file => [path.relative(root, file), map.fileCoverageFor(file).toSummary().toJSON()])
    ),
  };
}
function write(root, file, value) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes(value));
}
async function actualP2(root) {
  return convertP2Coverage({
    observation: JSON.parse(
      fs.readFileSync(new URL('./dist/local-coverage-observation.json', import.meta.url))
    ),
    generatedJs: read('capsule/dist/wrapper.mjs'),
    generatedTs: read('capsule/dist/wrapper.source.ts'),
    sourceMap: JSON.parse(read('capsule/dist/wrapper.js.map')),
    originalSource: read('capsule/dist/wrapper.original.ts'),
    retainedSegments: JSON.parse(read('dist/source-manifest.json')).retainedSegments,
    originalPath: root + '/apps/web/src/actions/admin-claims/assign.core.ts',
  });
}
const webSummary = 'apps/web/coverage/coverage-summary.json';
const sharedSummary = 'packages/shared-auth/coverage/coverage-summary.json';
test('required exact artifact file list contains original web summary', () => {
  assert.ok(expectedCoverageFiles([]).includes(webSummary));
});
test('actual old/new threshold witness: dropped 0/100 web map is rejected before P2 replacement', async t => {
  const root = fixture(t),
    file = root + '/apps/web/src/uncovered.ts';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x\n'.repeat(100));
  const ordinary = { [file]: row(file) },
    original = summary(ordinary, root);
  write(root, webSummary, original);
  write(root, sharedSummary, { total: { lines: { total: 1, covered: 1 } } });
  assert.equal(runCoverageGate({ rootDir: root, stdout: false }).ok, false);
  const p2 = await actualP2(root);
  // Reproduce the reviewed v1 loss exactly: its pure merge could receive {}.
  const dropped = root + '/dropped';
  const bad = mergeP2Coverage({
    ambientCoverage: {},
    p2Coverage: p2,
    outputDirectory: dropped + '/apps/web/coverage',
  });
  write(dropped, sharedSummary, { total: { lines: { total: 1, covered: 1 } } });
  assert.equal(bad.summary.lines.covered, 29);
  assert.equal(bad.summary.lines.total, 32);
  assert.equal(runCoverageGate({ rootDir: dropped, stdout: false }).ok, true);
  assert.throws(
    () => reconcileOrdinaryWebSummary({ coverage: {}, summary: original, candidateRoot: root }),
    /file identity/
  );
  assert.throws(
    () =>
      reconcileOrdinaryWebSummary({
        coverage: {},
        summary: { total: original.total },
        candidateRoot: root,
      }),
    /totals/
  );
  reconcileOrdinaryWebSummary({ coverage: ordinary, summary: original, candidateRoot: root });
  const retained = root + '/retained';
  const result = mergeP2Coverage({
    ambientCoverage: ordinary,
    p2Coverage: p2,
    outputDirectory: retained + '/apps/web/coverage',
  });
  write(retained, sharedSummary, { total: { lines: { total: 1, covered: 1 } } });
  assert.equal(result.summary.lines.total, 132);
  assert.equal(runCoverageGate({ rootDir: retained, stdout: false }).ok, false);
});
test('consistent zero-total web map and required summary remain valid', async t => {
  const root = fixture(t),
    empty = summary({}, root);
  reconcileOrdinaryWebSummary({ coverage: {}, summary: empty, candidateRoot: root });
  write(root, webSummary, empty);
  write(root, sharedSummary, { total: { lines: { total: 1, covered: 1 } } });
  assert.equal(runCoverageGate({ rootDir: root, stdout: false }).ok, true);
  const p2 = await actualP2(root),
    output = root + '/merged';
  mergeP2Coverage({
    ambientCoverage: {},
    p2Coverage: p2,
    outputDirectory: output + '/apps/web/coverage',
  });
  write(output, sharedSummary, { total: { lines: { total: 1, covered: 1 } } });
  assert.equal(runCoverageGate({ rootDir: output, stdout: false }).ok, true);
  assert.throws(
    () => reconcileOrdinaryWebSummary({ coverage: {}, summary: undefined, candidateRoot: root }),
    /file identity/
  );
});
test('full real ordinary OXC geometry including null end columns reconciles', async t => {
  const root = fixture(t),
    p2 = await actualP2(root);
  reconcileOrdinaryWebSummary({
    coverage: p2.coverageMap,
    summary: summary(p2.coverageMap, root),
    candidateRoot: root,
  });
});
for (const [name, alter] of Object.entries({
  missingFile: x => {
    delete x['apps/web/src/a.ts'];
  },
  extraFile: x => {
    x['apps/web/src/b.ts'] = x['apps/web/src/a.ts'];
  },
  foreignAbsolute: x => {
    x['/etc/private.ts'] = x['apps/web/src/a.ts'];
  },
  missingMetric: x => {
    delete x.total.functions;
  },
  wrongCovered: x => {
    x.total.lines.covered = 1;
  },
  wrongTotal: x => {
    x.total.statements.total = 101;
  },
  wrongSkipped: x => {
    x.total.lines.skipped = 1;
  },
  wrongPct: x => {
    x.total.lines.pct = 100;
  },
  perFileTotals: x => {
    x['apps/web/src/a.ts'].lines.total = 1;
  },
  extraMetric: x => {
    x.total.forged = {};
  },
}))
  test('reject summary inconsistency: ' + name, t => {
    const root = fixture(t),
      file = root + '/apps/web/src/a.ts',
      coverage = { [file]: row(file) };
    const value = summary(coverage, root);
    alter(value);
    assert.throws(() =>
      reconcileOrdinaryWebSummary({ coverage, summary: value, candidateRoot: root })
    );
  });
for (const [name, alter] of Object.entries({
  foreignDataWrapper: x => {
    x.data = {};
  },
  missingMap: x => {
    delete x.fnMap;
  },
  missingCount: x => {
    delete x.s[0];
  },
  extraCount: x => {
    x.s[999] = 1;
  },
  negativeCount: x => {
    x.s[0] = -1;
  },
  fractionalCount: x => {
    x.s[0] = 0.5;
  },
  extraLocationKey: x => {
    x.statementMap[0].ignored = true;
  },
  negativePosition: x => {
    x.statementMap[0].start.column = -1;
  },
  reversedPosition: x => {
    x.statementMap[0].end.line = 0;
  },
  nullStart: x => {
    x.statementMap[0].start.column = null;
  },
  emptyStatement: x => {
    x.statementMap[0] = { start: {}, end: {} };
  },
  missingFunctionCount: x => {
    x.fnMap[0] = { name: 'f', decl: x.statementMap[0], loc: x.statementMap[0] };
  },
  branchCardinality: x => {
    x.branchMap[0] = { type: 'if', loc: x.statementMap[0], locations: [x.statementMap[0]] };
    x.b[0] = [];
  },
  trueBranchIdentity: x => {
    x.bT = { 0: [1] };
  },
}))
  test('reject malformed complete map geometry: ' + name, () => {
    const value = row('/a.ts');
    alter(value);
    assert.throws(() => validateOrdinaryGeometry(value));
  });
test('protected dispatch reconciles web before fresh runtime and never copies old web summary into merge output', () => {
  const source = read('ordinary-dispatch.mjs');
  assert.ok(
    source.indexOf('reconcileOrdinaryWebSummary({') <
      source.indexOf('await runRequiredP2Runtime(options)')
  );
  assert.match(source, /file\.startsWith\('packages\/'\)/);
});
