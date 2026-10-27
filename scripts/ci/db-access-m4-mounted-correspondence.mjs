// Pure projection inside the existing private pair owner. No registrar or live handle.
import { createHash } from 'node:crypto';
import { retainMountedLineage } from './db-access-m4-mounted-lineage.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = reason => {
  throw Error('M4 mounted assignment refused: ' + reason);
};
const tuple = row =>
  JSON.stringify([row.profile, row.operationId, row.requestDigest, row.responseDigest]);
const profiles = ['legacy-admin', 'legacy-agent', 'staff'];
const cases = [
  'mounted-admin-assignment-source-route',
  'mounted-agent-assignment-source-route',
  'mounted-staff-assignment-source-route',
];
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function unique(rows, predicate, label) {
  const matches = rows.filter(predicate);
  if (matches.length !== 1) fail(label);
  return matches[0];
}
export function projectMountedAssignmentAcceptance({
  native,
  runtime,
  ordinary,
  event,
  effectAssertions,
}) {
  const source = effectAssertions.mountedAssignmentSource;
  const capture = runtime.completion.mountedAssignments;
  const contextSha256 = hash(JSON.stringify(event.context));
  if (
    !source ||
    source.kind !== 'fixed-mounted-assignment-source' ||
    !capture ||
    capture.version !== 1 ||
    !runtime.completion.completionValidated
  )
    fail('missing actual mounted source/completion');
  for (const value of [source, effectAssertions])
    if (
      value.contextSha256 !== contextSha256 ||
      value.sourcePolicyDigest !== native.sourcePolicyDigest ||
      value.runtimeReportSha256 !== runtime.reportSha256 ||
      value.imageDigest !== runtime.imageDigest
    )
      fail('same private source/image/event');
  if (
    ordinary.qualificationPurpose !== 'm4-c0' ||
    ordinary.sourceContext !== JSON.stringify(event.context) ||
    ordinary.providerPolicySha256 !== runtime.policySha256 ||
    !ordinary.execution ||
    !ordinary.ordinaryArtifactDigest ||
    ordinary.productionCCredit !== 0 ||
    ordinary.workflowFailureNotDeliveryAccepted !== true
  )
    fail('genuine ordinary C0 join');
  const trusted = effectAssertions.assignmentContextProof;
  if (
    trusted.contextSha256 !== contextSha256 ||
    trusted.runtimeReportSha256 !== runtime.reportSha256 ||
    trusted.imageDigest !== runtime.imageDigest ||
    trusted.sourcePolicyDigest !== native.sourcePolicyDigest
  )
    fail('owned trusted construction');
  if (
    !same(
      source.routes.map(row => row.profile),
      profiles
    )
  )
    fail('fixed mounted profiles');
  const localDecisions = source.routes.map((route, routeIndex) => {
    const premise = unique(
      trusted.profiles,
      row => row.profile === route.profile,
      'trusted profile'
    );
    if (
      !premise.qualifiedWithinActualLocalConstruction ||
      premise.productionContextQualified ||
      !premise.importedSemantics
    )
      fail('applicable owned transaction/operator premises');
    const witness = unique(
      source.witnesses,
      row => row.profile === route.profile,
      'fixed mounted assertion program'
    );
    if (witness.caseId !== cases[routeIndex]) fail('fixed mounted case ID');
    const completed = runtime.completion.profileCaseIds;
    if (
      completed.filter(id => id === witness.caseId).length !== 1 ||
      witness.assertions.length !== 9 ||
      new Set(witness.assertions.map(row => row.assertionSha256)).size !== 9 ||
      witness.assertions.some(
        row =>
          row.mandatoryOnSuccessfulCallback !== true ||
          row.caseId !== witness.caseId ||
          !hex(row.assertionSha256)
      )
    )
      fail('actual mandatory mounted case');
    const executed = capture.cases.filter(
      row => row.caseId === witness.caseId && row.profile === route.profile
    );
    if (executed.length !== 1) fail('exactly one actual mounted invocation');
    const keys = executed.map(row => JSON.stringify([row.runtimeId, tuple(row)]));
    if (new Set(keys).size !== keys.length) fail('duplicate mounted case observation');
    const references = executed.map(row => {
      if (
        !hex(row.requestDigest) ||
        !hex(row.responseDigest) ||
        !hex(row.wrapperResultDigest) ||
        row.responseProvenance !== 'owned-server' ||
        !Array.isArray(row.cachePaths) ||
        typeof row.operationId !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
          row.operationId
        ) ||
        row.outcome !== 'completed' ||
        row.delivery !== 'finished'
      )
        fail('positive mounted response');
      const owner = unique(
        capture.owners,
        value => value.runtimeId === row.runtimeId,
        'exact transport owner'
      );
      if (
        owner.version !== 1 ||
        owner.localQualificationOnly !== true ||
        owner.contexts?.localQualificationOnly !== true
      )
        fail('actual closed local owner');
      const transport = owner.transport.rows.filter(value => tuple(value) === tuple(row));
      if (
        transport.length !== 1 ||
        transport.some(
          value =>
            value.path !== route.path ||
            value.outcome !== row.outcome ||
            value.delivery !== 'finished'
        )
      )
        fail('actual HTTPS path/response');
      const contexts = owner.contexts.rows.filter(value => tuple(value) === tuple(row));
      if (contexts.length !== transport.length || !contexts.length)
        fail('transport/controller exact multiset');
      const ordinals = contexts.map(value => {
        if (
          value.receiver !== 'posture-checked-owned-data-drizzle' ||
          value.verifier !== 'owned-current-store-identity-drizzle' ||
          value.configurationIdentityChecked !== true ||
          value.capturedAfterPosture !== true ||
          !Number.isSafeInteger(value.ordinal)
        )
          fail('actual receiver/actor binding');
        if (
          !premise.capturedConstructions.some(
            ref => ref.runtimeId === row.runtimeId && ref.ordinal === value.ordinal
          )
        )
          fail('foreign construction reference');
        return value.ordinal;
      });
      if (new Set(ordinals).size !== ordinals.length) fail('duplicate controller ordinal');
      return {
        caseId: row.caseId,
        profile: row.profile,
        operationId: row.operationId,
        runtimeId: row.runtimeId,
        ordinals,
        requestDigest: row.requestDigest,
        responseDigest: row.responseDigest,
        responseProvenance: row.responseProvenance,
        wrapperResultDigest: row.wrapperResultDigest,
        cachePaths: row.cachePaths,
        multiplicity: contexts.length,
      };
    });
    return {
      profile: route.profile,
      sourceRoute: route,
      applicableTrustedConstruction: premise,
      executedRoutes: references,
      mandatoryAssertions: witness.assertions,
      qualifiedLocalMountedConstruction: true,
      adapterActuallyExecuted: true,
      nextActionIngressSourceOnly: true,
      nextDeploymentQualified: false,
      wholeOriginalIdentityQualified: false,
      productionContextQualified: false,
    };
  });
  const effectSourceFiles = localDecisions
    .flatMap(({ applicableTrustedConstruction: premise }) => [
      premise.sourceRoute?.transactionOwner?.[0],
      premise.sourceRoute?.kernelOwner?.[0],
      ...(premise.sharedHelpers ?? []).map(helper => helper.owner?.[0]),
    ])
    .filter(file => typeof file === 'string');
  const lineage = retainMountedLineage(native, [
    ...new Set([...source.sourceFiles, ...effectSourceFiles]),
  ]);
  const joined = new Set(
    localDecisions.flatMap(decision =>
      decision.executedRoutes.map(row => JSON.stringify([row.runtimeId, tuple(row)]))
    )
  );
  const unjoinedOwnerRows = capture.owners.flatMap(owner =>
    ['transport', 'contexts'].flatMap(kind =>
      owner[kind].rows.flatMap((row, rowIndex) =>
        joined.has(JSON.stringify([owner.runtimeId, tuple(row)]))
          ? []
          : [{ runtimeId: owner.runtimeId, kind, rowIndex, row }]
      )
    )
  );

  return {
    version: 1,
    kind: 'fixed-local-mounted-assignment-acceptance',
    contextSha256,
    sourcePolicyDigest: native.sourcePolicyDigest,
    runtimeReportSha256: runtime.reportSha256,
    imageDigest: runtime.imageDigest,
    localDecisions,
    sourceEffectReplacements: source.replacements,
    unjoinedOwnerRows,
    lineage,
    unmatchedRuntimeCases: capture.cases.filter(
      row => !source.witnesses.some(w => w.caseId === row.caseId && w.profile === row.profile)
    ),
    nativeAdmission: false,
    productionCCredit: 0,
    wholeGuardPass: false,
    allExecutableContextsQualified: false,
  };
}
