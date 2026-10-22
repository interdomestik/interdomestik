export const MESSAGE_TEST_IDENTITIES = Object.freeze([
  'message fixture database safety accepts the synthetic CI and task ports without a machine-specific port constraint',
  'message fixture database safety rejects remote and non-synthetic databases before creating clients or fixtures',
  'message fixture database safety rejects connection-string options that could redirect the approved target',
  'message operations on a real NOBYPASSRLS connection loads the owned public thread and sender projection across repeated reads',
  'message operations on a real NOBYPASSRLS connection preserves member/tenant denial, staff assignment and linked-agent visibility',
  'message operations on a real NOBYPASSRLS connection persists visible recipient receipts while rejecting internal/own/out-of-scope mutations',
  'message operations on a real NOBYPASSRLS connection sends a persisted public message with the same transaction and denies member internal send',
  'message operations on a real NOBYPASSRLS connection rolls back the insert when the created-message projection is unavailable',
  'message operations on a real NOBYPASSRLS connection keeps the existing error response after a post-commit audit failure without holding the transaction',
]);
const fail = reason => {
  throw new Error('message runtime result refused: ' + reason);
};
export function validateMessageTestResult(report) {
  if (
    report.success !== true ||
    report.numTotalTests !== 9 ||
    report.numPassedTests !== 9 ||
    report.numFailedTests !== 0 ||
    report.numPendingTests !== 0 ||
    report.numTodoTests !== 0 ||
    report.testResults?.length !== 1 ||
    report.testResults[0].status !== 'passed'
  )
    fail('suite result');
  const suite = report.testResults[0];
  if (
    !suite.name.endsWith(
      '/packages/domain-communications/src/messages/tenant-context.integration.test.ts'
    )
  )
    fail('test source');
  const tests = suite.assertionResults;
  if (tests.length !== 9 || tests.some(t => t.status !== 'passed' || t.failureMessages?.length))
    fail('test outcomes');
  const identities = tests.map(t => [...t.ancestorTitles, t.title].join(' '));
  if (
    new Set(identities).size !== 9 ||
    !MESSAGE_TEST_IDENTITIES.every(identity => identities.includes(identity))
  )
    fail('test identities');
  return identities;
}
