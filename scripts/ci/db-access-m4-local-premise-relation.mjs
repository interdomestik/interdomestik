// Pure data join ONLY, inside linkM4EffectAssertions after its existing owner checks.
// It cannot authenticate input objects or mint any native/runtime/coverage handle.
import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = reason => {
  throw Error('M4 local premise join refused: ' + reason);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
function factAt(source, pointer) {
  if (!pointer.startsWith('/derivations/')) fail('fact path');
  let fact = source;
  for (const part of pointer.slice(1).split('/')) {
    if (!fact || typeof fact !== 'object' || !Object.hasOwn(fact, part)) fail('missing fact');
    fact = fact[part];
  }
  return fact;
}
const residuals = Object.freeze([
  'Applicable current-store/provider guarantees absent from exact completed callbacks',
  'Postgres driver exceptional schedules not executed by this same owned pair',
  'Applicable SQL/operator/schema/RLS facts beyond exact fixture states and schedules',
  'TLS, deployed credentials/roles/ingress, mounted production constructors and hosted event',
  'Imported notification delivery and dynamic provider completion beyond fixed refusal witness',
  'Retained old mounts, open/escaped/unknown frames, ordinary P2 contexts and residual lineage',
]);

export function describeLocalPremises({
  source,
  runtime,
  imageRecords,
  fixedLinks,
  event,
  contract,
}) {
  if (
    !same(source.bookends.before, source.bookends.after) ||
    runtime.contextSha256 !== hash(JSON.stringify(event.context)) ||
    runtime.fixedContractSha256 !== hash(JSON.stringify(contract)) ||
    runtime.completion?.completionValidated !== true
  )
    fail('source/event/completion binding');
  for (const name of [
    'reportSha256',
    'imageDigest',
    'bundleSha256',
    'metafileSha256',
    'policySha256',
    'dependencyGraphSha256',
  ])
    if (!digest(runtime[name])) fail('runtime digest');
  if (
    imageRecords['m4-runtime.cjs']?.sha256 !== runtime.bundleSha256 ||
    !digest(imageRecords['m4-runtime-metafile.json']?.sha256)
  )
    fail('executed compiler outputs');
  const copiedInputs = [];
  for (const [file, record] of Object.entries({
    ...contract.files,
    ...contract.configuration,
    ...contract.migrations,
  })) {
    const actual = imageRecords[file];
    if (!actual || actual.sha256 !== record.sha256 || actual.bytes !== record.bytes)
      fail('fixed copied source/schema/configuration');
    copiedInputs.push({ file, sha256: actual.sha256 });
  }
  const ids = new Set();
  const witnesses = fixedLinks.map(link => {
    if (
      ids.has(link.id) ||
      link.executionObserved !== true ||
      link.completeEffectQualified !== false
    )
      fail('duplicate or broadened finite witness');
    ids.add(link.id);
    const completed =
      runtime.completion[link.caseGroup === 'private' ? 'privateCaseIds' : 'profileCaseIds'];
    if (
      !['private', 'profiles'].includes(link.caseGroup) ||
      completed.filter(id => id === link.caseId).length !== 1
    )
      fail('unexecuted case');
    if (hash(JSON.stringify(factAt(source, link.fact.path))) !== link.fact.sha256)
      fail('source fact');
    if (
      !link.assertions.length ||
      link.assertions.some(
        assertion =>
          assertion.mandatoryOnSuccessfulCallback !== true ||
          assertion.caseId !== link.caseId ||
          !digest(assertion.callbackSha256) ||
          !digest(assertion.assertionSha256)
      )
    )
      fail('assertion nodes');
    for (const file of link.fact.sourceFiles) {
      if (source.sourceRecords[file.file]?.sha256 !== file.sha256) fail('native source');
      if (file.executedImageBinding && imageRecords[file.file]?.sha256 !== file.sha256)
        fail('executed source');
    }
    return {
      id: link.id,
      fact: structuredClone(link.fact),
      caseGroup: link.caseGroup,
      caseId: link.caseId,
      fixtureFile: link.fixtureFile,
      fixtureSha256: link.fixtureSha256,
      assertions: structuredClone(link.assertions),
      scope: link.scope,
      context: link.executionContext,
      finiteConsequenceObserved: true,
      completePremiseQualified: false,
    };
  });
  const diagnostic = runtime.minimalOpsPrivilegeDiagnostic;
  if (
    !diagnostic ||
    diagnostic.expectedMinimalGrants !== true ||
    diagnostic.positiveRows !== 1 ||
    diagnostic.forbiddenBranchSelectSqlstate !== '42501' ||
    diagnostic.roleGrantExpansion !== false
  )
    fail('actual minimal-purpose diagnostic');
  return {
    version: 1,
    kind: 'm4-finite-local-premise-relation',
    contextSha256: runtime.contextSha256,
    policySha256: runtime.policySha256,
    sourcePolicyDigest: source.policyDigest,
    sourceBookends: structuredClone(source.bookends),
    runtimeReportSha256: runtime.reportSha256,
    imageDigest: runtime.imageDigest,
    fixedContractSha256: runtime.fixedContractSha256,
    dependencyGraphSha256: runtime.dependencyGraphSha256,
    compiler: {
      version: contract.compilerVersion,
      bundleSha256: runtime.bundleSha256,
      normalizedMetafileSha256: runtime.metafileSha256,
      metafileFileSha256: imageRecords['m4-runtime-metafile.json'].sha256,
      semanticCorrectnessQualified: false,
    },
    copiedInputs,
    minimalPurposeDiagnostic: structuredClone(diagnostic),
    witnesses,
    missingAuthControls: [
      'current-store-invalid-signature-without-business-effects',
      'current-store-expired-session-cleanup-without-business-effects',
    ].filter(id => !ids.has(id)),
    scope: 'same owned local runtime/native pair and exact fixed callback contexts',
    unresolvedPremises: [...residuals],
    completePremiseQualified: false,
    acceptedCoverage: 0,
    nativeAdmission: false,
    productionCCredit: 0,
  };
}
