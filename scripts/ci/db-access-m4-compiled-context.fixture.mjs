// Synthetic closed data for pure relation tests; never an execution capability.
import { digest } from './db-access-m4-compiled-context-common.mjs';
import { lineageObservationKey } from './db-access-m4-factory-context-rule.mjs';
import { PROFILES } from './db-access-m4-assignment-context-profiles.mjs';
export const sha = 'a'.repeat(64);
export function nativeFixture() {
  const owner = ['a.ts', 0, 100, 263],
    operation = ['a.ts', 20, 29, 212];
  const observation = {
    origin: 'root.ts',
    owner,
    invocation: null,
    context: null,
    definingContext: null,
    outcome: 'visited',
    inventoryIndices: [0],
    memberships: [],
    dispatchClassification: 'no-additional-state-query',
    occurrences: 2,
  };
  const selected = {
    inventoryIndex: 0,
    identity: sha,
    file: 'a.ts',
    method: 'select',
    owner,
    operation,
  };
  return {
    requirements: { operations: [{ ...selected, profiles: ['ops'], expressionSha256: sha }] },
    native: {
      modelDigest: sha,
      sourcePolicyDigest: sha,
      sourceBookends: { before: sha, after: sha },
      inventory: {
        entries: [{ row: { identity: sha, file: 'a.ts', method: 'select' }, owner, operation }],
      },
      rawGraph: {
        m4Contexts: {
          modelDigest: sha,
          roots: ['root.ts'],
          affectedLineage: {
            selection: { entries: [selected] },
            batches: [
              {
                roots: ['root.ts'],
                modelDigest: sha,
                sourcePolicyDigest: sha,
                sourceBookends: { before: sha, after: sha },
                frames: [],
                observations: [observation],
                entryEmissions: [
                  {
                    observationKey: lineageObservationKey(observation),
                    inventoryIndex: 0,
                    identity: sha,
                    origin: 'root.ts',
                    kind: 'entry-unsafe',
                    reason: 'unknown receiver',
                    occurrences: 2,
                  },
                ],
              },
            ],
          },
        },
      },
    },
  };
}
const web = ['legacy-admin', 'legacy-agent', 'staff'],
  programs = ['runAdminAssignment', 'runAgentAssignment', 'runStaffAssignment'];
export function executionFixture() {
  const event = { context: { eventName: 'pull_request', sourceCommit: 'b'.repeat(40) } };
  const contextSha256 = digest(event.context),
    shared = [
      'current-store-invalid-signature-without-business-effects',
      'current-store-expired-session-cleanup-without-business-effects',
      'controller-queued-session-denial',
      'r6-posture-before-dispatch',
      'r6-elevated-role-gate',
    ];
  const observations = [...web, web[0]].map((profile, index) => ({
    profile,
    outcome: index === 3 ? 'denied' : 'completed',
    operationId: '00000000-0000-4000-8000-00000000000' + index,
    requestDigest: digest(['request', index]),
    responseDigest: digest(['response', index]),
    runtimeOrdinal: index + 1,
    frameworkActionId: 'action-' + (index === 3 ? 0 : index),
    program: programs[index === 3 ? 0 : index],
  }));
  const contextRows = observations.map(row => ({
    profile: row.profile,
    operationId: row.operationId,
    requestDigest: row.requestDigest,
    responseDigest: row.responseDigest,
    ordinal: row.runtimeOrdinal,
    receiver: 'posture-checked-owned-data-drizzle',
    verifier: 'owned-current-store-identity-drizzle',
    configurationIdentityChecked: true,
    capturedAfterPosture: true,
  }));
  const opsContext = {
    ...contextRows[0],
    profile: 'ops',
    operationId: '00000000-0000-4000-8000-000000000005',
    ordinal: 1,
  };
  const actionMap = Object.fromEntries(programs.map((value, index) => ['action-' + index, value]));
  const compiled = {
    kind: 'fresh-strict-compiled-runtime',
    contextSha256,
    policySha256: sha,
    sourceBookends: { before: { source: sha }, after: { source: sha } },
    imageDigest: sha,
    bundleSha256: sha,
    metafileSha256: sha,
    productionCCredit: 0,
    sourceDerivation: { actions: programs.map((name, index) => ({ name, profile: web[index] })) },
    completion: {
      kind: 'owned-strict-compiled-execution',
      cleanup: { complete: true, forcedTermination: false, remainingOwnedSessions: 0 },
      observations,
      strictOwnerConstruction: {
        ownerInstanceId: 'actual-owner-instance',
        constructorName: 'startM4PrivateAssignmentOwner',
        localQualificationOnly: false,
        loopbackQualification: false,
        contexts: {
          constructorName: 'createM4PrivateAssignmentRuntime',
          localQualificationOnly: false,
          loopbackQualification: false,
          rows: contextRows,
        },
        transport: {
          rows: observations.map(row => ({
            profile: row.profile,
            path: '/m4/assignment/' + row.profile,
            operationId: row.operationId,
            requestDigest: row.requestDigest,
            responseDigest: row.responseDigest,
            outcome: row.outcome,
            delivery: 'finished',
          })),
        },
      },
      strictOpsObservation: {
        profile: 'ops',
        outcome: 'completed',
        operationId: opsContext.operationId,
        requestDigest: opsContext.requestDigest,
        responseDigest: opsContext.responseDigest,
        runtimeOrdinal: 1,
        opsInstanceId: 'actual-ops-instance',
        constructorName: 'createM4PrivateAssignmentRuntime',
        localQualificationOnly: false,
        loopbackQualification: false,
        context: opsContext,
        caseId: 'strict-ops-own-claim-success-and-sql-v1',
        actorId: 'actor',
        tenantId: 'tenant',
        claimId: 'claim',
        staffId: 'staff',
        sql: {
          claimRows: 1,
          auditRows: 1,
          ledgerRows: 1,
          notificationRows: 0,
          fingerprint: digest([1, 'm4.ops.assign-owner', 'actor', 'tenant', 'claim', 'staff']),
          assignedAt: '2026-10-28T00:00:00.000Z',
        },
      },
      platformEvidence: {
        actionMap,
        sourceInputs: { 'app/actions.js': { kind: 'file', mode: 420, bytes: 1, sha256: sha } },
        image: { actionMap, manifestSha256: sha, filesSha256: sha },
        productionCCredit: 0,
        cleanup: { drained: true },
        sourceImageBookends: { before: { image: sha }, after: { image: sha } },
        kernel: { denials: 105, diagnosticForkGrantNotUsedByNext: true },
        reporter: {
          drained: true,
          sha256: sha,
          cases: ['a', 'b', 'c', 'd'].map(title => ({ title, status: 'passed' })),
        },
      },
    },
  };
  const links = [...new Set([...shared, ...PROFILES.flatMap(spec => spec.witnesses)])].map(id => ({
    id,
    executionObserved: true,
    caseGroup: 'profiles',
    caseId: id,
    fact: { path: '/derivations/fixed', sha256: sha },
    assertions: [
      {
        mandatoryOnSuccessfulCallback: true,
        caseId: id,
        callbackSha256: sha,
        assertionSha256: sha,
      },
    ],
  }));
  const runtime = {
    contextSha256,
    policySha256: sha,
    reportSha256: sha,
    imageDigest: sha,
    completion: { profileCaseIds: links.map(row => row.caseId) },
  };
  const effectAssertions = {
    fixedOracleLinks: links,
    assignmentContextProof: {
      contextSha256,
      runtimeReportSha256: sha,
      imageDigest: sha,
      profiles: PROFILES.map(spec => ({
        profile: spec.profile,
        qualifiedWithinActualLocalConstruction: true,
        productionContextQualified: false,
        sourceRoute: {
          kernelOwner: ['k.ts', 0, 100, 263],
          parameterBindings: [{ parameter: ['k.ts', 1, 2, 169] }],
        },
        derivedEffects: [{ fixed: true }],
        importedSemantics: { bindings: [{ sha256: sha }] },
      })),
    },
  };
  return {
    compiled,
    runtime,
    event,
    effectAssertions,
    requirements: {
      nextSourceInputs: { 'app/actions.js': { mode: '100644', bytes: 1, sha256: sha } },
      executedSources: [{ file: 'a.ts', sha256: sha, bytes: 1 }],
    },
    imageRecords: { 'a.ts': { sha256: sha, bytes: 1 } },
    workerLoaderInspection: {
      scope: 'LOADER_ONLY_LOCAL',
      cardinality: { priorWorkers: 1, graphWorkers: 4, workers: 5 },
      sourceDataReadsQualified: false,
    },
  };
}
