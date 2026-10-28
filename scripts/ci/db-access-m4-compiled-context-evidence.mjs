// Closed-data checks after the lexical pair consumes the real compiled capability.
import { PROFILES } from './db-access-m4-assignment-context-profiles.mjs';
import { digest, same, hex, one, fail, positive } from './db-access-m4-compiled-context-common.mjs';
const web = ['legacy-admin', 'legacy-agent', 'staff'];
const programs = ['runAdminAssignment', 'runAgentAssignment', 'runStaffAssignment'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const tuple = row =>
  JSON.stringify([row.profile, row.operationId, row.requestDigest, row.responseDigest]);
function captured(row) {
  if (
    !uuid.test(row.operationId) ||
    !positive(row.ordinal) ||
    !hex(row.requestDigest) ||
    !hex(row.responseDigest) ||
    row.configurationIdentityChecked !== true ||
    row.capturedAfterPosture !== true ||
    row.receiver !== 'posture-checked-owned-data-drizzle' ||
    row.verifier !== 'owned-current-store-identity-drizzle'
  )
    fail('strict actual captured constructor configuration');
}
export function relateCompiledExecutedContexts({
  compiled,
  runtime,
  event,
  effectAssertions,
  requirements,
  imageRecords,
  workerLoaderInspection,
}) {
  const contextSha256 = digest(event.context),
    proof = effectAssertions.assignmentContextProof;
  if (
    compiled.kind !== 'fresh-strict-compiled-runtime' ||
    compiled.contextSha256 !== contextSha256 ||
    compiled.policySha256 !== runtime.policySha256 ||
    proof.contextSha256 !== contextSha256 ||
    proof.runtimeReportSha256 !== runtime.reportSha256 ||
    proof.imageDigest !== runtime.imageDigest ||
    !same(compiled.sourceBookends.before, compiled.sourceBookends.after) ||
    !hex(compiled.imageDigest) ||
    !hex(compiled.bundleSha256) ||
    !hex(compiled.metafileSha256) ||
    compiled.productionCCredit !== 0 ||
    workerLoaderInspection.scope !== 'LOADER_ONLY_LOCAL' ||
    !same(workerLoaderInspection.cardinality, { priorWorkers: 1, graphWorkers: 4, workers: 5 }) ||
    workerLoaderInspection.sourceDataReadsQualified !== false
  )
    fail('same owned event/source/policy/worker custody');
  for (const expected of requirements.executedSources)
    if (
      !hex(expected.sha256) ||
      imageRecords[expected.file]?.sha256 !== expected.sha256 ||
      imageRecords[expected.file]?.bytes !== expected.bytes
    )
      fail('same parsed/native/compiled source');
  const completion = compiled.completion,
    platform = completion.platformEvidence;
  if (
    completion.kind !== 'owned-strict-compiled-execution' ||
    completion.cleanup.complete !== true ||
    completion.cleanup.forcedTermination !== false ||
    completion.cleanup.remainingOwnedSessions !== 0 ||
    platform.cleanup.drained !== true ||
    !same(platform.sourceImageBookends.before, platform.sourceImageBookends.after) ||
    !same(platform.actionMap, platform.image.actionMap) ||
    !hex(platform.image.manifestSha256) ||
    !hex(platform.image.filesSha256) ||
    platform.productionCCredit !== 0 ||
    platform.kernel.denials !== 105 ||
    platform.kernel.diagnosticForkGrantNotUsedByNext !== true ||
    platform.reporter.drained !== true ||
    !Array.isArray(platform.reporter.cases) ||
    platform.reporter.cases.length !== 4 ||
    new Set(platform.reporter.cases.map(row => row.title)).size !== 4 ||
    platform.reporter.cases.some(row => row.status !== 'passed') ||
    !hex(platform.reporter.sha256)
  )
    fail('actual closed compiled image and denial evidence');
  if (
    !platform.sourceInputs ||
    !requirements.nextSourceInputs ||
    !same(
      Object.keys(platform.sourceInputs).sort(),
      Object.keys(requirements.nextSourceInputs).sort()
    )
  )
    fail('exact Next source input membership');
  for (const [file, expected] of Object.entries(requirements.nextSourceInputs)) {
    const actual = platform.sourceInputs[file];
    if (
      actual?.kind !== 'file' ||
      actual.sha256 !== expected.sha256 ||
      actual.bytes !== expected.bytes ||
      !Number.isSafeInteger(actual.mode) ||
      Boolean(actual.mode & 0o111) !== (expected.mode === '100755')
    )
      fail('actual Next action/vendor source differs from native/source derivation');
  }
  const owner = completion.strictOwnerConstruction;
  if (
    owner.constructorName !== 'startM4PrivateAssignmentOwner' ||
    owner.localQualificationOnly !== false ||
    owner.loopbackQualification !== false ||
    owner.contexts.constructorName !== 'createM4PrivateAssignmentRuntime' ||
    owner.contexts.localQualificationOnly !== false ||
    owner.contexts.loopbackQualification !== false ||
    typeof owner.ownerInstanceId !== 'string' ||
    !owner.ownerInstanceId ||
    owner.contexts.rows.length !== 4 ||
    owner.transport.rows.length !== 4
  )
    fail('actual strict owner provenance');
  if (
    completion.observations.length !== 4 ||
    !same(
      completion.observations.map(row => row.profile),
      [...web, web[0]]
    )
  )
    fail('three actual browser profiles and separate denial');
  const constructions = [];
  for (const [index, row] of completion.observations.entries()) {
    const isDenial = index === 3,
      profile = web[isDenial ? 0 : index],
      program = programs[isDenial ? 0 : index];
    if (
      row.profile !== profile ||
      row.outcome !== (isDenial ? 'denied' : 'completed') ||
      platform.actionMap[row.frameworkActionId] !== program ||
      row.program !== program
    )
      fail('literal compiled action/profile');
    const context = one(
      owner.contexts.rows,
      value => tuple(value) === tuple(row),
      'strict owner settlement'
    );
    captured(context);
    if (row.runtimeOrdinal !== context.ordinal) fail('actual owner ordinal');
    const transport = one(
      owner.transport.rows,
      value => tuple(value) === tuple(row),
      'strict HTTP settlement'
    );
    if (
      transport.outcome !== row.outcome ||
      transport.delivery !== 'finished' ||
      transport.path !== '/m4/assignment/' + profile
    )
      fail('actual TLS/HTTP transport settlement');
    if (!isDenial)
      constructions.push({ instanceId: owner.ownerInstanceId, ordinal: context.ordinal, ...row });
  }
  const ops = completion.strictOpsObservation;
  if (
    !ops ||
    ops.profile !== 'ops' ||
    ops.outcome !== 'completed' ||
    ops.constructorName !== 'createM4PrivateAssignmentRuntime' ||
    ops.localQualificationOnly !== false ||
    ops.loopbackQualification !== false ||
    typeof ops.opsInstanceId !== 'string' ||
    !ops.opsInstanceId ||
    ops.opsInstanceId === owner.ownerInstanceId
  )
    fail('separate actual successful strict ops construction');
  captured(ops.context);
  if (
    tuple(ops) !== tuple(ops.context) ||
    ops.runtimeOrdinal !== ops.context.ordinal ||
    ops.caseId !== 'strict-ops-own-claim-success-and-sql-v1' ||
    ops.sql?.claimRows !== 1 ||
    ops.sql.auditRows !== 1 ||
    ops.sql.ledgerRows !== 1 ||
    ops.sql.notificationRows !== 0 ||
    ops.sql.fingerprint !==
      digest([1, 'm4.ops.assign-owner', ops.actorId, ops.tenantId, ops.claimId, ops.staffId]) ||
    typeof ops.sql.assignedAt !== 'string' ||
    !Number.isFinite(Date.parse(ops.sql.assignedAt)) ||
    new Date(ops.sql.assignedAt).toISOString() !== ops.sql.assignedAt
  )
    fail('actual strict ops capture/SQL settlement');
  constructions.push({ instanceId: ops.opsInstanceId, ordinal: ops.context.ordinal, ...ops });
  if (
    new Set(constructions.map(row => JSON.stringify([row.instanceId, row.ordinal]))).size !== 4 ||
    new Set(constructions.map(tuple)).size !== 4
  )
    fail('duplicate construction/operation settlement');
  const assertions = [];
  for (const spec of PROFILES) {
    const actual = one(
      constructions,
      row => row.profile === spec.profile,
      'required successful strict profile'
    );
    const local = one(
      proof.profiles,
      row => row.profile === spec.profile,
      'fixed current source/control class'
    );
    if (
      !local.qualifiedWithinActualLocalConstruction ||
      local.productionContextQualified !== false ||
      !local.sourceRoute.kernelOwner ||
      !local.sourceRoute.parameterBindings.length ||
      !local.derivedEffects.length ||
      !local.importedSemantics?.bindings.length
    )
      fail('complete applicable fixed source class');
    for (const id of [
      ...spec.witnesses,
      'current-store-invalid-signature-without-business-effects',
      'current-store-expired-session-cleanup-without-business-effects',
      'controller-queued-session-denial',
      'r6-posture-before-dispatch',
      'r6-elevated-role-gate',
    ]) {
      const link = one(
        effectAssertions.fixedOracleLinks,
        row => row.id === id,
        'mandatory source witness'
      );
      const completed =
        runtime.completion[link.caseGroup === 'private' ? 'privateCaseIds' : 'profileCaseIds'];
      if (
        !link.executionObserved ||
        completed.filter(value => value === link.caseId).length !== 1 ||
        !link.assertions.length ||
        link.assertions.some(
          row =>
            row.mandatoryOnSuccessfulCallback !== true ||
            row.caseId !== link.caseId ||
            !hex(row.callbackSha256) ||
            !hex(row.assertionSha256)
        )
      )
        fail('mandatory executed assertion');
      assertions.push({
        profile: spec.profile,
        instanceId: actual.instanceId,
        ordinal: actual.ordinal,
        id: link.id,
        caseId: link.caseId,
        fact: link.fact,
        assertions: link.assertions,
      });
    }
  }
  return {
    constructions,
    assertions,
    actions: compiled.sourceDerivation.actions,
    nativeWorkerSourceDataJoin:
      'actual private native source/model/Git proof plus identical executed source records; loader inspection retains its local-only limits',
  };
}
