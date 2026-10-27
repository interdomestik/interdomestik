// Data-only fixed projection. The actual entry remains a lexical private pair-owner function.
import { createHash } from 'node:crypto';
import { deriveFixedFactoryConstruction } from './db-access-m4-factory-source-rule.mjs';
import { deriveFactoryContextDecisions } from './db-access-m4-factory-context-rule.mjs';
import { accountAcceptedFactoryContexts } from './db-access-m4-acceptance-accounting.mjs';
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
  const construction = deriveFixedFactoryConstruction(ordinary.execution);
  const decisions = deriveFactoryContextDecisions(native, construction);
  const accounting = accountAcceptedFactoryContexts(native, decisions);
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
      'exact closed non-DB callback in qualified fixed P2 capsule; no business SQL/provider premise is discharged',
    decisions,
    ...accounting,
    otherApplicablePremises: 'held for every context outside this exact non-DB-return proof class',
    allExecutableContextsQualified: false,
    fullM4Complete: false,
    allSourceContextsClosed: false,
    ordinaryCoverageNativeCredit: false,
  };
}
