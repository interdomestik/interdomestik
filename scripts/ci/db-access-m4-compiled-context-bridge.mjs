// Called only inside the existing lexical pair sink after private native/ordinary/compiled takes.
// A data projection is not a registrar or a standalone execution authority.
import { retainCompiledHistoricalRelations } from './db-access-m4-compiled-context-history.mjs';
import { deriveCompiledContextRequirements } from './db-access-m4-compiled-context-source.mjs';
import { relateCompiledNativeOperations } from './db-access-m4-compiled-context-native.mjs';
import { relateCompiledExecutedContexts } from './db-access-m4-compiled-context-evidence.mjs';
import { qualifyAssignmentPrimitiveBindings } from './db-access-m4-assignment-primitive-semantics.mjs';
import { M4_RUNTIME_CONTRACT } from './db-access-m4-runtime-contract.mjs';
import { digest, same, fail } from './db-access-m4-compiled-context-common.mjs';
export function linkM4CompiledConstructionContexts({
  native,
  source,
  runtime,
  compiledTaken,
  event,
  effectAssertions,
  workerLoaderInspection,
  candidateRoot,
}) {
  const { result: compiled, imageRecords } = compiledTaken;
  if (
    source.policyDigest !== native.sourcePolicyDigest ||
    effectAssertions.sourcePolicyDigest !== source.policyDigest ||
    native.eventBinding.contextSha256 !== digest(event.context) ||
    !same(source.bookends, native.sourceBookends)
  )
    fail('same actual native model/source receipt');
  const requirements = deriveCompiledContextRequirements(source, candidateRoot, compiled);
  const primitives = qualifyAssignmentPrimitiveBindings(imageRecords, M4_RUNTIME_CONTRACT);
  const nativeRelation = relateCompiledNativeOperations(native, requirements);
  const historicalRelations = retainCompiledHistoricalRelations(native, nativeRelation, source);
  const executed = relateCompiledExecutedContexts({
    compiled,
    runtime,
    event,
    effectAssertions,
    requirements,
    imageRecords,
    workerLoaderInspection,
  });
  if (
    !requirements.vendor.length ||
    !nativeRelation.references.length ||
    !executed.constructions.length ||
    !executed.assertions.length
  )
    fail('nonempty required T/S/P conjuncts');
  return {
    version: 1,
    kind: 'bounded-compiled-assignment-construction-contexts',
    contextSha256: compiled.contextSha256,
    policySha256: compiled.policySha256,
    sourcePolicyDigest: native.sourcePolicyDigest,
    compiledImageDigest: compiled.imageDigest,
    compiledReportSha256: compiled.reportSha256,
    fixedRequirementsSha256: digest(requirements),
    requirements,
    nativeRelation,
    executed,
    primitives,
    historicalRelations,
    acceptedTrustedContexts: executed.constructions.map(row => ({
      profile: row.profile,
      instanceId: row.instanceId,
      ordinal: row.ordinal,
      operationId: row.operationId,
      requestDigest: row.requestDigest,
      responseDigest: row.responseDigest,
      construction:
        'fixed exact strict source/authority/control/effect + compiled/private assertion conjunction',
      nativeSourceOperations: nativeRelation.references
        .filter(ref => ref.profiles.includes(row.profile))
        .map(ref => ({
          inventoryIndex: ref.inventoryIndex,
          identity: ref.identity,
          owner: ref.owner,
          operation: ref.operation,
        })),
      wholeOriginalIdentityQualified: false,
      allocatedRawOccurrences: 0,
    })),
    acceptedPreservedSourceCorrespondences: requirements.vendor,
    originalDisposition:
      'all original live mounts and shared helper/native contexts retained; no deletion or whole-ID T/S admission',
    scopedConstructionQualified: true,
    allExecutableContextsQualified: false,
    acceptedOriginalIdentities: [],
    rawOccurrencesSubtracted: 0,
    productionCCredit: 0,
    nativeAdmission: false,
    fullM4Complete: false,
  };
}
