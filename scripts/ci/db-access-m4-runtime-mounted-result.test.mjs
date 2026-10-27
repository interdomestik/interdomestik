import assert from 'node:assert/strict';
import test from 'node:test';
import { validateM4MountedCompletion } from './db-access-m4-runtime-mounted-result.mjs';
import { mountedCompletionFixture } from './db-access-m4-runtime-mounted-result.fixture.mjs';
const contract = {
  caseIDs: {
    private: [],
    profiles: [],
    mounted: [
      'mounted-admin-assignment-source-route',
      'mounted-agent-assignment-source-route',
      'mounted-staff-assignment-source-route',
    ],
  },
};
const validate = report =>
  validateM4MountedCompletion(report, report.assignmentContextConstruction, contract);
test('three explicit synthetic shapes validate only data, with all original contexts retained', () => {
  const report = mountedCompletionFixture(contract),
    before = structuredClone(report);
  const result = validate(report);
  assert.deepEqual(result.mountedCaseIds, contract.caseIDs.mounted);
  assert.deepEqual(report, before);
  assert.equal(result.mountedAssignments, report.mountedAssignments);
});
for (const [name, mutate] of [
  ['missing owner', r => r.mountedAssignments.owners.pop()],
  [
    'wrong context',
    r => (r.mountedAssignments.owners[0].contexts.rows[0].requestDigest = 'd'.repeat(64)),
  ],
  ['duplicate owner', r => r.mountedAssignments.owners.push(r.mountedAssignments.owners[0])],
  ['foreign path', r => (r.mountedAssignments.owners[0].transport.rows[0].path = '/other')],
  ['null positive response', r => (r.mountedAssignments.cases[0].responseDigest = null)],
  [
    'ambiguous tuple',
    r =>
      r.mountedAssignments.owners[0].transport.rows.push(
        r.mountedAssignments.owners[0].transport.rows[0]
      ),
  ],
  [
    'foreign original ordinal',
    r => (r.assignmentContextConstruction.assignmentContexts[1].rows = []),
  ],
  ['foreign owner', r => (r.mountedAssignments.cases[0].runtimeId = 1000)],
  [
    'same positive owner',
    r => (r.mountedAssignments.cases[1].runtimeId = r.mountedAssignments.cases[0].runtimeId),
  ],
  ['wrong ordered case', r => r.mountedAssignments.cases.reverse()],
  ['unknown field', r => (r.mountedAssignments.cases[0].callerAuthority = true)],
  ['caller provenance', r => (r.mountedAssignments.cases[0].responseProvenance = 'caller')],
  ['dropped cache call', r => r.mountedAssignments.cases[0].cachePaths.pop()],
  ['uncertain outcome', r => (r.mountedAssignments.cases[0].outcome = 'indeterminate')],
  ['unfinished delivery', r => (r.mountedAssignments.cases[0].delivery = 'pending')],
  [
    'malformed wrapper digest',
    r => (r.mountedAssignments.cases[0].wrapperResultDigest = 'not-a-digest'),
  ],
])
  test(name + ' refuses the closed shape', () => {
    const report = structuredClone(mountedCompletionFixture(contract));
    mutate(report);
    assert.throws(() => validate(report), /mounted assignment completion/u);
  });
test('unmatched null response rows remain present, with no forced success or ordinal allocation', () => {
  const report = mountedCompletionFixture(contract);
  report.assignmentContextConstruction.assignmentContexts[0].rows[0].responseDigest = null;
  validate(report);
  assert.equal(
    report.assignmentContextConstruction.assignmentContexts[0].rows[0].responseDigest,
    null
  );
  assert.equal(report.assignmentContextConstruction.assignmentContexts.length, 4);
});
