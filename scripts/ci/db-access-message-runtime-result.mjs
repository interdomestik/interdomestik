import {
  MESSAGE_CASES,
  MESSAGE_PROOF_CONTRACT,
  MESSAGE_RUNS,
} from './db-access-message-proof-registry.mjs';

// Compatibility export of full names only; joins bind messageCaseIdentities() (file + name).
export const MESSAGE_TEST_IDENTITIES = Object.freeze(MESSAGE_CASES.map(entry => entry.fullName));
export const messageRunResultFile = index => `messages-result-${index}.json`;
const fail = reason => {
  throw new Error('message runtime result refused: ' + reason);
};
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// Exact per-file membership: one suite, only registered identities, all actually passed.
export function validateMessageRunResult(report, run) {
  const expected = MESSAGE_CASES.filter(entry => entry.file === run?.file).map(
    entry => entry.fullName
  );
  if (!MESSAGE_RUNS.includes(run) || !expected.length) fail('unregistered run');
  const suites = report?.testResults;
  if (
    report?.success !== true ||
    report.numTotalTests !== expected.length ||
    report.numPassedTests !== expected.length ||
    report.numFailedTests !== 0 ||
    report.numPendingTests !== 0 ||
    report.numTodoTests !== 0 ||
    report.numFailedTestSuites !== 0 ||
    (report.numRuntimeErrorTestSuites ?? 0) !== 0 ||
    (report.numPendingTestSuites ?? 0) !== 0 ||
    !Array.isArray(suites) ||
    suites.length !== 1 ||
    suites[0].status !== 'passed' ||
    (suites[0].message ?? '') !== ''
  )
    fail('suite result ' + run.file);
  const suite = suites[0];
  if (typeof suite.name !== 'string' || !suite.name.endsWith('/' + run.file))
    fail('test source ' + run.file);
  const tests = suite.assertionResults;
  if (
    !Array.isArray(tests) ||
    tests.length !== expected.length ||
    tests.some(
      t =>
        t.status !== 'passed' ||
        (t.failureMessages ?? []).length !== 0 ||
        !Array.isArray(t.ancestorTitles)
    )
  )
    fail('test outcomes ' + run.file);
  const identities = tests.map(t => [...t.ancestorTitles, t.title].join(' '));
  if (tests.some((t, index) => t.fullName !== undefined && t.fullName !== identities[index]))
    fail('test identity form ' + run.file);
  if (new Set(identities).size !== expected.length || !sameSet(identities, expected))
    fail('test identities ' + run.file);
  return Object.freeze(expected);
}

// Reports are positional: report i must belong to MESSAGE_RUNS[i] and nothing else.
export function validateMessageRuntimeResults(reports) {
  if (!Array.isArray(reports) || reports.length !== MESSAGE_RUNS.length) fail('run count');
  const files = MESSAGE_RUNS.map((run, index) => ({
    file: run.file,
    identities: validateMessageRunResult(reports[index], run),
  }));
  if (
    files.reduce((total, entry) => total + entry.identities.length, 0) !==
    MESSAGE_PROOF_CONTRACT.requiredTests
  )
    fail('total identities');
  return files;
}
