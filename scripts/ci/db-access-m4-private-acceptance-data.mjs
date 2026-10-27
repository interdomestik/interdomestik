import { projectMountedAssignmentAcceptance } from './db-access-m4-mounted-correspondence.mjs';
// Data-only fixed projection. The actual entry remains a lexical private pair-owner function.
import { createHash } from 'node:crypto';
import { deriveMountedAssignmentProofConstruction } from './db-access-m4-mounted-p2-proof.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = reason => {
  throw Error('M4 private construction refused: ' + reason);
};
export function projectFixedPrivateAcceptance({
  native,
  nativeOutputDigest,
  runtime,
  ordinary,
  event,
  effectAssertions,
  workerLoaderInspection,
}) {
  const contextSha256 = hash(JSON.stringify(event.context));
  if (
    event.context.eventName !== 'pull_request' ||
    native.eventBinding.contextSha256 !== contextSha256 ||
    runtime.contextSha256 !== contextSha256 ||
    ordinary.sourceContext !== JSON.stringify(event.context) ||
    ordinary.providerPolicySha256 !== runtime.policySha256 ||
    ordinary.dispatchContext !== 'required-pr-isolated' ||
    !ordinary.execution ||
    typeof ordinary.imageId !== 'string' ||
    !ordinary.imageId ||
    typeof nativeOutputDigest !== 'string' ||
    !nativeOutputDigest
  )
    fail('same protected event/source/policy/ordinary context');
  const premise = effectAssertions?.localPremises;
  for (const relation of [effectAssertions, premise])
    if (
      !relation ||
      relation.sourcePolicyDigest !== native.sourcePolicyDigest ||
      relation.contextSha256 !== runtime.contextSha256 ||
      relation.runtimeReportSha256 !== runtime.reportSha256 ||
      relation.imageDigest !== runtime.imageDigest
    )
      fail('existing live effect/applicable-premise relation binding');
  if (workerLoaderInspection?.scope !== 'LOADER_ONLY_LOCAL') fail('existing bounded loader scope');
  const construction = deriveMountedAssignmentProofConstruction(ordinary.execution);
  if (
    construction.kind !== 'm4-current-mounted-proof-construction' ||
    construction.currentProofClassQualified !== true ||
    construction.dataOnly !== true ||
    construction.exactCaseCount !== 10 ||
    construction.directFactoryCoverageObserved !== false ||
    construction.noSDKNetworkAuthorityFromUnitClass !== true ||
    construction.actualP2FreshOwnerRequired !== true ||
    construction.acceptedOldIdentityCount !== 0 ||
    construction.runtimeAdmission !== false ||
    construction.nativeAdmission !== false
  )
    fail('current fixed ordinary source/assertion class');
  const historicalFactoryTransitions = construction.historicalFactoryTransitions.map(row => ({
    ...row,
    currentInventoryReferences: native.inventory.entries.flatMap((entry, inventoryIndex) =>
      entry.row.identity === row.identity
        ? [{ inventoryIndex, identity: row.identity, disposition: 'retained-current-native-entry' }]
        : []
    ),
    currentNativeIdentityAccepted: false,
  }));
  const mountedAssignment = projectMountedAssignmentAcceptance({
    native,
    runtime,
    ordinary,
    event,
    effectAssertions,
  });
  return {
    version: 1,
    kind: 'm4-fixed-private-construction-acceptance',
    nativeOutputDigest,
    contextSha256,
    providerPolicySha256: runtime.policySha256,
    runtimeImageDigest: runtime.imageDigest,
    runtimeReportSha256: runtime.reportSha256,
    sourcePolicyDigest: native.sourcePolicyDigest,
    workerLoaderInspectionSha256: hash(JSON.stringify(workerLoaderInspection)),
    loaderScope: workerLoaderInspection.scope,
    ordinaryImageId: ordinary.imageId,
    ordinaryArtifactDigest: ordinary.ordinaryArtifactDigest,
    ordinarySourceSnapshot: ordinary.sourceBefore,
    ordinaryProducerClosure: ordinary.parentBefore,
    construction,
    applicablePremiseClass:
      'current fixed ordinary source/assertion class joined to three actual local mounted assignment routes',
    historicalFactoryTransitions,
    mountedAssignment,
    acceptedOldIdentityCount: 0,
    acceptedOriginalIdentities: [],
    acceptedCoverage: 0,
    nativeAdmission: false,
    productionCCredit: 0,
    workflowFailureNotDeliveryAccepted: true,
    currentLocalConstructionQualified:
      mountedAssignment.localDecisions.length === 3 &&
      mountedAssignment.localDecisions.every(row => row.qualifiedLocalMountedConstruction === true),
    otherApplicablePremises:
      'retained for every context outside the three fixed local mounted constructions; Next deployment and production consumer C0 remain residual',
    allExecutableContextsQualified: false,
    fullM4Complete: false,
    allSourceContextsClosed: false,
    ordinaryCoverageNativeCredit: false,
  };
}
