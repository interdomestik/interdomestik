// Explicit data doubles only; no private owner, SQL, HTTPS or native execution.
import { createHash } from 'node:crypto';
import { mountedP2ExecutionFixture } from './db-access-m4-mounted-p2-proof.fixture.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
export function mountedAcceptanceFixture() {
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
      kind: 'fixed-mounted-assignment-source',
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
  native.eventBinding = { contextSha256 };
  effectAssertions.localPremises = { ...binding };
  ordinary.execution = mountedP2ExecutionFixture();
  ordinary.dispatchContext = 'required-pr-isolated';
  ordinary.imageId = 'explicit-unit-image';
  return {
    native,
    runtime,
    ordinary,
    event,
    effectAssertions,
    nativeOutputDigest: hash('explicit-unit-native'),
    workerLoaderInspection: { scope: 'LOADER_ONLY_LOCAL' },
  };
}
