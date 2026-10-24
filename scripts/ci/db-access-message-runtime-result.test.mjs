import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MESSAGE_CASES,
  MESSAGE_RUNS,
  messageCaseIdentities,
} from './db-access-message-proof-registry.mjs';
import {
  validateMessageRunResult,
  validateMessageRuntimeResults,
} from './db-access-message-runtime-result.mjs';

const root = '/owned/assembly/messages';
const casesOf = run => MESSAGE_CASES.filter(entry => entry.file === run.file);
function report(run, cases = casesOf(run)) {
  return {
    success: true,
    numTotalTests: cases.length,
    numPassedTests: cases.length,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    numFailedTestSuites: 0,
    testResults: [
      {
        name: root + '/' + run.file,
        status: 'passed',
        message: '',
        assertionResults: cases.map(entry => ({
          ancestorTitles: [],
          title: entry.fullName,
          fullName: entry.fullName,
          status: 'passed',
          failureMessages: [],
        })),
      },
    ],
  };
}
const reports = () => MESSAGE_RUNS.map(run => report(run));

test('twenty exact per-file identities from five fresh runs are required', () => {
  const files = validateMessageRuntimeResults(reports());
  assert.deepEqual(
    files.map(entry => entry.file),
    MESSAGE_RUNS.map(run => run.file)
  );
  assert.deepEqual(
    files.flatMap(entry => entry.identities.map(fullName => ({ file: entry.file, fullName }))),
    messageCaseIdentities()
  );
});

test('every run refuses missing, substituted, duplicate, skipped, todo, failed or runtime-error outcomes', () => {
  const first = r => r.testResults[0].assertionResults[0];
  const mutations = [
    r => r.testResults[0].assertionResults.pop(),
    r => {
      r.testResults[0].assertionResults.pop();
      r.numTotalTests -= 1;
      r.numPassedTests -= 1;
    },
    r => (first(r).title = first(r).fullName = 'substituted'),
    r => (r.testResults[0].assertionResults[0] = r.testResults[0].assertionResults[1]),
    r => (first(r).status = 'pending'),
    r => (first(r).status = 'skipped'),
    r => (first(r).failureMessages = ['raw failure']),
    r => (first(r).fullName = 'different identity form'),
    r => (r.testResults[0].status = 'failed'),
    r => (r.testResults[0].message = 'beforeAll setup error'),
    r => (r.testResults[0].name = root + '/packages/foreign.test.ts'),
    r => r.testResults.push(structuredClone(r.testResults[0])),
    r => (r.numTodoTests = 1),
    r => (r.numPendingTests = 1),
    r => (r.numFailedTestSuites = 1),
    r => (r.numRuntimeErrorTestSuites = 1),
    r => (r.numPendingTestSuites = 1),
    r => (r.success = false),
  ];
  for (const run of MESSAGE_RUNS)
    for (const mutate of mutations) {
      const changed = report(run);
      mutate(changed);
      assert.throws(() => validateMessageRunResult(changed, run), /refused/);
    }
});

test('cases cannot move between files, runs or report positions', () => {
  const [safety, tenant, agent] = MESSAGE_RUNS;
  const moved = [...casesOf(tenant).slice(1), casesOf(agent)[0]];
  assert.throws(() => validateMessageRunResult(report(tenant, moved), tenant), /refused/);
  const swapped = reports();
  [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
  assert.throws(() => validateMessageRuntimeResults(swapped), /refused/);
  assert.throws(() => validateMessageRuntimeResults(reports().slice(1)), /refused/);
  assert.throws(() => validateMessageRuntimeResults([...reports(), report(safety)]), /refused/);
  assert.throws(() => validateMessageRunResult(report(safety), { ...safety }), /refused/);
});
