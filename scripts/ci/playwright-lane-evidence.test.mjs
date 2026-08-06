import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizePlaywrightReport } from './playwright-lane-evidence.mjs';
import {
  encode,
  expectedSummary,
  HEAD,
  makeReport,
  passingTest,
  SPEC,
} from './playwright-lane-evidence-fixtures.mjs';

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
  report.suites[0].specs[1].tags = ['@quarantine'];
  const summary = summarizePlaywrightReport({
    report: encode(report),
    headSha: HEAD,
    lane: 'pr-gate',
  });
  assert.deepEqual(summary.retryRecovered, [SPEC]);
  assert.deepEqual(summary.quarantined, [SPEC]);
  report.suites[0].specs[1].tags = ['prefix@quarantine', '@@quarantine'];
  assert.deepEqual(
    summarizePlaywrightReport({
      report: encode(report),
      headSha: HEAD,
      lane: 'pr-gate',
    }).quarantined,
    []
  );
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
    {
      mutate: report => delete report.suites,
      headSha: HEAD,
      lane: 'pr-gate',
      error: /SUITES_INVALID/u,
    },
    {
      mutate: report => {
        report.suites[0].specs[0].file = '../unsafe.spec.ts';
      },
      headSha: HEAD,
      lane: 'pr-gate',
      error: /SPEC_PATH_INVALID/u,
    },
    {
      mutate: report => {
        report.suites[0].specs[0].tests[0].status = 'mystery';
      },
      headSha: HEAD,
      lane: 'pr-gate',
      error: /OUTCOME_INVALID/u,
    },
    {
      mutate: report => {
        report.suites[0].specs[0].tests[0].expectedStatus = 'mystery';
      },
      headSha: HEAD,
      lane: 'pr-gate',
      error: /OUTCOME_INVALID/u,
    },
    {
      mutate: report => {
        report.suites[0].specs[0].tests[0].results[0].status = 'mystery';
      },
      headSha: HEAD,
      lane: 'pr-gate',
      error: /OUTCOME_INVALID/u,
    },
    {
      mutate: report => report.suites[0].specs[0].tests.push(passingTest('gate-ks-sq')),
      headSha: HEAD,
      lane: 'pr-gate',
      error: /PROJECT_DUPLICATE/u,
    },
    {
      mutate: report => report.suites[0].specs.push(structuredClone(report.suites[0].specs[0])),
      headSha: HEAD,
      lane: 'pr-gate',
      error: /SPEC_DUPLICATE/u,
    },
  ];
  for (const entry of cases) {
    const report = makeReport();
    entry.mutate(report);
    assert.throws(
      () =>
        summarizePlaywrightReport({
          report: encode(report),
          headSha: entry.headSha,
          lane: entry.lane,
        }),
      entry.error
    );
  }
});
