import { compiledAcceptanceData } from './db-access-m4-mounted-integration-test.fixture.mjs';
import { addOriginalFactoryBankFixture } from './db-access-m4-original-factory-bank.fixture.mjs';
import { projectFixedPrivateAcceptance } from './db-access-m4-private-acceptance-data.mjs';
import { mountedP2ExecutionFixture } from './db-access-m4-mounted-p2-proof.fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { projectMountedAssignmentAcceptance } from './db-access-m4-mounted-correspondence.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const event = { context: { eventName: 'pull_request', candidateCommit: 'a'.repeat(40) } };
  const contextSha256 = hash(JSON.stringify(event.context));
  const binding = {
    contextSha256,
    sourcePolicyDigest: 'policy',
    runtimeReportSha256: 'report',
    imageDigest: 'image',
  };
  const profiles = ['legacy-admin', 'legacy-agent', 'staff'];
  const caseId = profile =>
    'mounted-' +
    { 'legacy-admin': 'admin', 'legacy-agent': 'agent', staff: 'staff' }[profile] +
    '-assignment-source-route';
  const rows = profiles.map((profile, index) => ({
    profile,
    operationId: '00000000-0000-4000-8000-' + String(index).padStart(12, '0'),
    requestDigest: hash('request' + index),
    responseDigest: hash('response' + index),
    outcome: 'completed',
    delivery: 'finished',
    responseProvenance: 'owned-server',
    wrapperResultDigest: hash('wrapper' + index),
    cachePaths: [],
    ordinal: index + 1,
    receiver: 'posture-checked-owned-data-drizzle',
    verifier: 'owned-current-store-identity-drizzle',
    configurationIdentityChecked: true,
    capturedAfterPosture: true,
  }));
  const routes = profiles.map(profile => ({ profile, path: '/m4/assignment/' + profile }));
  const native = {
    sourcePolicyDigest: 'policy',
    inventory: { entries: [] },
    rawGraph: { m4Contexts: { affectedLineage: { selection: { entries: [] }, batches: [] } } },
  };
  const runtime = {
    contextSha256,
    reportSha256: 'report',
    imageDigest: 'image',
    policySha256: 'provider',
    completion: {
      completionValidated: true,
      profileCaseIds: profiles.map(caseId),
      mountedAssignments: {
        version: 1,
        owners: [
          {
            runtimeId: 1,
            version: 1,
            localQualificationOnly: true,
            contexts: { localQualificationOnly: true, rows },
            transport: {
              rows: rows.map(row => ({ ...row, path: '/m4/assignment/' + row.profile })),
            },
          },
        ],
        cases: rows.map(row => ({ ...row, runtimeId: 1, caseId: caseId(row.profile) })),
      },
    },
  };
  const ordinary = {
    qualificationPurpose: 'm4-c0',
    sourceContext: JSON.stringify(event.context),
    providerPolicySha256: 'provider',
    execution: {},
    ordinaryArtifactDigest: hash('artifact'),
    productionCCredit: 0,
    workflowFailureNotDeliveryAccepted: true,
  };
  const effectAssertions = {
    ...binding,
    mountedAssignmentSource: {
      ...binding,
      kind: 'fixed-local-qualification-assignment-source',
      qualificationScope: 'local-adapters-only-no-next-ingress',
      localQualificationOnly: true,
      nextActionIngressQualified: false,
      routes,
      sourceFiles: [],
      replacements: [],
      witnesses: profiles.map(profile => ({
        profile,
        caseId: caseId(profile),
        assertions: Array.from({ length: 9 }, (_, i) => ({
          caseId: caseId(profile),
          mandatoryOnSuccessfulCallback: true,
          assertionSha256: hash('mandatory-assertion-' + i),
        })),
      })),
    },
    assignmentContextProof: {
      ...binding,
      profiles: profiles.map((profile, index) => ({
        profile,
        qualifiedWithinActualLocalConstruction: true,
        productionContextQualified: false,
        importedSemantics: { fixed: true },
        capturedConstructions: [{ runtimeId: 1, ordinal: index + 1 }],
      })),
    },
  };
  return { native, runtime, ordinary, event, effectAssertions };
}
test('actual tuple/multiset association gives three local decisions without native allocation', () => {
  const input = fixture(),
    result = projectMountedAssignmentAcceptance(input);
  assert.equal(result.localDecisions.length, 3);
  assert.deepEqual(result.lineage.acceptedOriginalIdentities, []);
  assert.equal(result.productionCCredit, 0);
  assert.equal(result.nativeAdmission, false);
});
for (const [name, mutate] of [
  [
    'one omitted required assertion',
    x => x.effectAssertions.mountedAssignmentSource.witnesses[0].assertions.pop(),
  ],
  [
    'duplicate assertion node',
    x =>
      (x.effectAssertions.mountedAssignmentSource.witnesses[0].assertions[1] =
        x.effectAssertions.mountedAssignmentSource.witnesses[0].assertions[0]),
  ],
  ['missing ordinary', x => delete x.ordinary.execution],
  [
    'missing wrapper result',
    x => delete x.runtime.completion.mountedAssignments.cases[0].wrapperResultDigest,
  ],
  [
    'caller response provenance',
    x => (x.runtime.completion.mountedAssignments.cases[0].responseProvenance = 'caller'),
  ],
  ['null response', x => (x.runtime.completion.mountedAssignments.cases[0].responseDigest = null)],
  ['foreign ordinary source', x => (x.ordinary.sourceContext = 'foreign')],
  ['foreign image', x => (x.effectAssertions.mountedAssignmentSource.imageDigest = 'foreign')],
  ['missing actual route', x => x.runtime.completion.mountedAssignments.cases.pop()],
  [
    'wrong endpoint path',
    x => (x.runtime.completion.mountedAssignments.owners[0].transport.rows[0].path = '/foreign'),
  ],
  [
    'changed response',
    x => (x.runtime.completion.mountedAssignments.cases[0].responseDigest = hash('foreign')),
  ],
  [
    'changed actor verification',
    x =>
      (x.runtime.completion.mountedAssignments.owners[0].contexts.rows[0].verifier =
        'caller-session'),
  ],
  [
    'changed tx',
    x =>
      (x.runtime.completion.mountedAssignments.owners[0].contexts.rows[0].receiver = 'ambient-db'),
  ],
  [
    'foreign ordinal',
    x =>
      (x.effectAssertions.assignmentContextProof.profiles[0].capturedConstructions[0].ordinal = 99),
  ],
  [
    'missing mandatory assertion',
    x => (x.effectAssertions.mountedAssignmentSource.witnesses[0].assertions = []),
  ],
  [
    'uncertain positive result',
    x => (x.runtime.completion.mountedAssignments.cases[0].outcome = 'uncertain'),
  ],
  ['wrong profile', x => (x.effectAssertions.mountedAssignmentSource.routes[0].profile = 'ops')],
  [
    'duplicate transport tuple',
    x =>
      x.runtime.completion.mountedAssignments.owners[0].transport.rows.push(
        x.runtime.completion.mountedAssignments.owners[0].transport.rows[0]
      ),
  ],
])
  test(name + ' refuses instead of manufacturing applicable correspondence', () => {
    const input = fixture();
    mutate(input);
    assert.throws(() => projectMountedAssignmentAcceptance(input));
  });
test('completion order does not allocate context ordinals', () => {
  const input = fixture();
  input.runtime.completion.mountedAssignments.owners[0].contexts.rows.reverse();
  const result = projectMountedAssignmentAcceptance(input);
  assert.deepEqual(
    result.localDecisions.map(row => row.executedRoutes[0].ordinals),
    [[1], [2], [3]]
  );
});

test('current pure dual P2/source projection joins only exact original factory credit', () => {
  // Data-only control: the actual entry still requires fresh private native/runtime/ordinary owners.
  const input = fixture();
  input.native.eventBinding = { contextSha256: input.effectAssertions.contextSha256 };
  input.effectAssertions.localPremises = { ...input.effectAssertions };
  input.ordinary.execution = mountedP2ExecutionFixture();
  input.ordinary.dispatchContext = 'required-pr-isolated';
  input.ordinary.imageId = 'explicit-unit-image';
  input.nativeOutputDigest = hash('explicit-unit-native');
  input.workerLoaderInspection = { scope: 'LOADER_ONLY_LOCAL' };
  addOriginalFactoryBankFixture(input);
  input.compiledConstruction = compiledAcceptanceData(input);
  const result = projectFixedPrivateAcceptance(input);
  assert.equal(
    result.originalFactoryBank.accounting.originalSelectedCohort.contextOccurrences,
    1685
  );
  assert.equal(result.construction.currentProofClassQualified, true);
  assert.equal(result.currentLocalConstructionQualified, true);
  assert.equal(result.acceptedOldIdentityCount, 2);
  assert.equal(result.acceptedCoverage, 2);
  assert.equal(result.nativeAdmission, false);
  assert.ok(result.historicalFactoryTransitions.every(row => !row.currentNativeIdentityAccepted));
  assert.equal(result.boundedCompiledConstructionQualified, true);
  for (const mutate of [
    x => delete x.compiledConstruction,
    x => (x.compiledConstruction.scopedConstructionQualified = false),
    x => (x.compiledConstruction.kind = 'foreign'),
    x => x.compiledConstruction.acceptedTrustedContexts.pop(),
    x => (x.compiledConstruction.acceptedPreservedSourceCorrespondences = []),
    x => (x.compiledConstruction.policySha256 = 'foreign'),
    x => (x.compiledConstruction.contextSha256 = 'foreign'),
    x => (x.compiledConstruction.sourcePolicyDigest = 'foreign'),
    x => x.compiledConstruction.acceptedOriginalIdentities.push('forged'),
    x => (x.compiledConstruction.rawOccurrencesSubtracted = 1),
  ]) {
    const changed = structuredClone(input);
    mutate(changed);
    assert.throws(() => projectFixedPrivateAcceptance(changed), /compiled trusted\/preserved/);
  }
  input.ordinary.execution.actualCases.pop();
  assert.throws(() => projectFixedPrivateAcceptance(input));
});
