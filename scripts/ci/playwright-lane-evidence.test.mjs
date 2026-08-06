import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { runCli, summarizePlaywrightReport } from './playwright-lane-evidence.mjs';

const HEAD = 'a'.repeat(40);
const SPEC = 'e2e/gate/public-header-overflow.spec.ts';
const PROJECTS = ['gate-ks-sq', 'gate-mk-contract', 'gate-mk-mk'];

function passingTest(projectName) {
  return {
    expectedStatus: 'passed',
    projectId: projectName,
    projectName,
    results: [{ retry: 0, status: 'passed' }],
    status: 'expected',
  };
}

function makeReport() {
  return {
    config: { projects: PROJECTS.map(name => ({ id: name, name })) },
    suites: [
      {
        file: 'gate/public-header-overflow.spec.ts',
        specs: [
          {
            file: 'gate/public-header-overflow.spec.ts',
            id: 'spec-a',
            tags: [],
            tests: PROJECTS.map(passingTest),
          },
          {
            file: 'gate/public-header-overflow.spec.ts',
            id: 'spec-b',
            tags: [],
            tests: [passingTest('gate-ks-sq')],
          },
        ],
      },
    ],
  };
}

function encode(report = makeReport()) {
  return Buffer.from(JSON.stringify(report));
}

function expectedSummary(reportBytes = encode()) {
  return {
    schemaVersion: 1,
    headSha: HEAD,
    lane: 'pr-gate',
    status: 'pass',
    projects: PROJECTS,
    specs: [SPEC],
    total: 4,
    retryRecovered: [],
    quarantined: [],
    reportSha256: createHash('sha256').update(reportBytes).digest('hex'),
  };
}

test('summarizes a Playwright report in canonical deterministic order', () => {
  const report = makeReport();
  report.suites[0].specs[0].tests.reverse();
  assert.deepEqual(
    summarizePlaywrightReport({ report: encode(report), headSha: HEAD, lane: 'pr-gate' }),
    expectedSummary(encode(report))
  );
});

test('records final-pass retries and quarantined specs without changing pass status', () => {
  const report = makeReport();
  const recovered = report.suites[0].specs[0].tests[0];
  recovered.status = 'flaky';
  recovered.results = [
    { retry: 0, status: 'failed' },
    { retry: 1, status: 'passed' },
  ];
  report.suites[0].specs[1].tags = ['quarantine'];
  const summary = summarizePlaywrightReport({ report: encode(report), headSha: HEAD, lane: 'pr-gate' });
  assert.deepEqual(summary.retryRecovered, [SPEC]);
  assert.deepEqual(summary.quarantined, [SPEC]);
});

test('marks known unexpected Playwright outcomes as failed evidence', () => {
  const report = makeReport();
  report.suites[0].specs[0].tests[0].status = 'unexpected';
  assert.equal(
    summarizePlaywrightReport({ report: encode(report), headSha: HEAD, lane: 'pr-gate' }).status,
    'fail'
  );
});

test('rejects malformed identity, report shape, outcomes, and duplicates', () => {
  const cases = [
    { mutate: () => {}, headSha: 'abc', lane: 'pr-gate', error: /HEAD_SHA_INVALID/u },
    { mutate: () => {}, headSha: HEAD, lane: '../gate', error: /LANE_INVALID/u },
    { mutate: report => delete report.suites, headSha: HEAD, lane: 'pr-gate', error: /SUITES_INVALID/u },
    { mutate: report => { report.suites[0].specs[0].file = '../unsafe.spec.ts'; }, headSha: HEAD, lane: 'pr-gate', error: /SPEC_PATH_INVALID/u },
    { mutate: report => { report.suites[0].specs[0].tests[0].status = 'mystery'; }, headSha: HEAD, lane: 'pr-gate', error: /OUTCOME_INVALID/u },
    { mutate: report => { report.suites[0].specs[0].tests[0].expectedStatus = 'mystery'; }, headSha: HEAD, lane: 'pr-gate', error: /OUTCOME_INVALID/u },
    { mutate: report => { report.suites[0].specs[0].tests[0].results[0].status = 'mystery'; }, headSha: HEAD, lane: 'pr-gate', error: /OUTCOME_INVALID/u },
    { mutate: report => { report.suites[0].specs[0].tests.push(passingTest('gate-ks-sq')); }, headSha: HEAD, lane: 'pr-gate', error: /PROJECT_DUPLICATE/u },
    { mutate: report => { report.suites[0].specs.push(structuredClone(report.suites[0].specs[0])); }, headSha: HEAD, lane: 'pr-gate', error: /SPEC_DUPLICATE/u },
  ];
  for (const entry of cases) {
    const report = makeReport();
    entry.mutate(report);
    assert.throws(
      () => summarizePlaywrightReport({ report: encode(report), headSha: entry.headSha, lane: entry.lane }),
      entry.error
    );
  }
});

test('CLI validates arguments and paths, then writes exact canonical bytes', () => {
  const reportPath = '/repo/apps/web/test-results/pr-gate/report.json';
  const outputPath = '/repo/tmp/verification-evidence/pr-gate.json';
  const reportBytes = encode();
  const writes = [];
  const io = {
    repoRoot: '/repo',
    readFileSync(filePath) {
      if (filePath !== reportPath) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return reportBytes;
    },
    realpathSync: filePath => filePath,
    mkdirSync() {},
    writeFileSync: (filePath, data) => writes.push([filePath, data]),
  };
  const args = [
    '--report=apps/web/test-results/pr-gate/report.json',
    `--head=${HEAD}`,
    '--lane=pr-gate',
    '--out=tmp/verification-evidence/pr-gate.json',
  ];
  runCli(args, io);
  assert.deepEqual(writes, [[outputPath, `${JSON.stringify(expectedSummary(reportBytes), null, 2)}\n`]]);

  for (const invalidArgs of [
    args.slice(1),
    [...args, '--lane=pr-gate'],
    [...args, '--unknown=value'],
    args.map(arg => arg.startsWith('--report=') ? '--report=../outside.json' : arg),
    args.map(arg => arg.startsWith('--report=') ? '--report=apps/web//report.json' : arg),
    args.map(arg => arg.startsWith('--out=') ? '--out=tmp/outside.json' : arg),
    args.map(arg => arg.startsWith('--out=') ? '--out=tmp/./verification-evidence/out.json' : arg),
  ]) {
    assert.throws(() => runCli(invalidArgs, io));
  }
  assert.throws(() => runCli(args, { ...io, readFileSync: () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); } }), /REPORT_MISSING/u);
  assert.throws(() => runCli(args, { ...io, readFileSync: () => Buffer.from('{') }), /REPORT_JSON_INVALID/u);
  assert.throws(
    () => runCli(args, { ...io, realpathSync: filePath => filePath === reportPath ? '/outside/report.json' : filePath }),
    /REPORT_PATH_OUTSIDE/u
  );
  assert.throws(
    () => runCli(args, { ...io, realpathSync: filePath => filePath === '/repo/tmp/verification-evidence' ? '/outside/evidence' : filePath }),
    /OUTPUT_PATH_OUTSIDE/u
  );
});
