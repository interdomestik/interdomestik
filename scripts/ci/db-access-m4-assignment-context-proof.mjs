import { PROFILES } from './db-access-m4-assignment-context-profiles.mjs';
// Fixed assignment-family context refinement, only joined through fresh private owners.
import { createHash } from 'node:crypto';
import { assertM4RuntimeImageRecords } from './db-access-m4-runtime.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import { qualifyAssignmentPrimitiveBindings } from './db-access-m4-assignment-primitive-semantics.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = reason => {
  throw Error('M4 assignment context refused: ' + reason);
};

function one(rows, predicate, label) {
  const values = rows.filter(predicate);
  if (values.length !== 1) fail('unique ' + label);
  return values[0];
}
// Pure derivation over already authenticated source/runtime/image data. Its return is
// data, never a live witness/registrar; the exported owner join below authenticates first.
export function deriveAssignmentContextRefinements({
  native,
  source,
  runtime,
  event,
  fixedLinks,
  primitiveBindings,
}) {
  if (
    runtime.contextSha256 !== hash(JSON.stringify(event.context)) ||
    runtime.assignmentContextConstruction !== runtime.completion.assignmentContextConstruction ||
    !runtime.completion.completionValidated ||
    !same(source.bookends.before, source.bookends.after)
  )
    fail('same source/event/actual completion');
  const capture = source.derivations.privateRuntime.assignmentContextSource;
  const transaction = one(
    source.derivations.controller.contextFunctions,
    row => row.name === '$owned-transaction',
    'owned transaction'
  );
  if (
    capture?.version !== 1 ||
    !Array.isArray(capture.factories) ||
    transaction.parameters.length !== 1 ||
    source.derivations.controller.transactionBinding?.receiverName !== 'database' ||
    !same(source.derivations.controller.transactionBinding.callback, transaction.owner) ||
    !same(source.derivations.controller.transactionBinding.parameter, transaction.parameters[0])
  )
    fail('fixed capture/source clauses');
  const functions = {
    kernel: source.derivations.kernel.contextFunctions,
    shared: source.derivations.assignmentKernels.facts.shared.contextFunctions,
    legacy: source.derivations.assignmentKernels.facts.legacy.contextFunctions,
    staff: source.derivations.assignmentKernels.facts.staff.contextFunctions,
  };
  const allFunctions = Object.values(functions).flat(),
    selected = native.rawGraph.m4Contexts.affectedLineage.selection;
  const contexts = runtime.assignmentContextConstruction.assignmentContexts;
  const witnesses = new Map(fixedLinks.map(link => [link.id, link]));
  const sharedWitnessIds = [
    'current-store-invalid-signature-without-business-effects',
    'current-store-expired-session-cleanup-without-business-effects',
    'controller-queued-session-denial',
    'r6-posture-before-dispatch',
    'r6-elevated-role-gate',
  ];
  const constructionRows = contexts.flatMap(owner =>
    owner.rows.map(row => ({ runtimeId: owner.runtimeId, ...row }))
  );
  const profiles = PROFILES.map(spec => {
    const factory = one(
      capture.factories,
      row => row.name === spec.factory,
      'fixed ' + spec.profile + ' constructor'
    );
    const invocation = one(
      transaction.calls,
      row => row.target.name === spec.entry,
      'fixed ' + spec.profile + ' invocation'
    );
    const entry = one(
      functions[spec.role],
      row => row.name === spec.entry,
      'fixed ' + spec.profile + ' kernel'
    );
    if (!invocation.receiverForwarded || invocation.arguments.length !== entry.parameters.length)
      fail('owned tx forwarded');
    const actual = constructionRows.filter(row => row.profile === spec.profile);
    if (!actual.length) fail('unexecuted fixed profile');
    for (const row of actual)
      if (
        row.receiver !== 'posture-checked-owned-data-drizzle' ||
        row.verifier !== 'owned-current-store-identity-drizzle' ||
        !row.configurationIdentityChecked ||
        !row.capturedAfterPosture
      )
        fail('foreign actual configuration');
    const evidence = [...sharedWitnessIds, ...spec.witnesses].map(id => {
      const value = witnesses.get(id);
      if (!value || value.executionObserved !== true || value.completeEffectQualified !== false)
        fail('applicable executed witness ' + id);
      return {
        id,
        caseId: value.caseId,
        fixtureFile: value.fixtureFile,
        assertions: value.assertions,
      };
    });
    const effectFacts =
      spec.role === 'kernel'
        ? source.derivations.kernel.facts.effects.map((fact, index) => ({
            path: '/derivations/kernel/facts/effects/' + index,
            sha256: hash(JSON.stringify(fact)),
            fact,
          }))
        : Object.entries(source.derivations.assignmentKernels.facts[spec.role].clauses).flatMap(
            ([name, clauses]) =>
              clauses.map((fact, index) => ({
                path:
                  '/derivations/assignmentKernels/facts/' +
                  spec.role +
                  '/clauses/' +
                  name +
                  '/' +
                  index,
                sha256: hash(JSON.stringify(fact)),
                fact,
              }))
          );
    if (
      spec.role === 'kernel' &&
      (!same(source.derivations.kernel.facts.transaction, {
        receiver: 'tx',
        owner: 'caller',
        opensOrCommits: false,
        everyEffectOn: 'tx',
      }) ||
        source.derivations.kernel.facts.actorRoleConsumed !== false)
    )
      fail('kernel receiver premise');
    // Source-owned refinement of this exact closed private construction, not an
    // invented non-null generic frame or allocation from an aggregate raw row.
    return {
      profile: spec.profile,
      contextClass: 'fixed-private-bootstrap-owned-assignment',
      capturedConstructions: actual.map(row => ({
        runtimeId: row.runtimeId,
        ordinal: row.ordinal,
      })),
      sourceRoute: {
        bootstrapFactory: factory.locator,
        configuration: capture.configuration.locator,
        dataDatabase: capture.dataDatabase.locator,
        verifier: capture.verifier.locator,
        transactionOwner: transaction.owner,
        transactionParameter: transaction.parameters[0],
        dataTransactionBinding: source.derivations.controller.transactionBinding,
        kernelInvocation: invocation.locator,
        kernelOwner: entry.owner,
        parameterBindings: entry.parameters.map((parameter, index) => ({
          parameter,
          argument: invocation.arguments[index],
        })),
      },
      actorTenantFlow:
        spec.profile === 'ops'
          ? {
              actorId: 'current locked actor.id',
              actorRole: 'current locked actor.role',
              tenantId: 'verified principal.accessTenantId',
              claimId: 'parsed request.claimId',
              staffId: 'parsed normalized request.staffId',
            }
          : {
              actor: 'current locked actor id/role/branch + verified principal.accessTenantId',
              claimId: 'parsed request.claimId',
              staffId: 'fixed profile normalization',
              observation: 'bounded nonauthoritative observation',
            },
      derivedEffects: effectFacts,
      sharedHelpers:
        spec.role === 'kernel'
          ? []
          : ['lockEligibleStaff', 'insertAssignmentAudit'].map(name =>
              one(functions.shared, row => row.name === name, 'shared ' + name)
            ),
      applicablePremises: {
        transaction:
          'actual captured data Drizzle plus exact source-owned transaction callback; same-image commit/rollback controls',
        actorTenant:
          'actual captured current-store verifier; current locked actor and effective tenant source mapping',
        imports: 'finite direct operator/helper/schema laws on exact installed/copy image records',
        builderExecution:
          'canonical-tx scalar builder class on the same pinned executed image; no arbitrary ORM route',
        intrinsics:
          'fixed Node image/no hostile intrinsic mutation within this closed producer path',
        useContexts:
          'only the new lexical owned runtime/profile construction; all other use contexts remain residual',
      },
      importedSemantics: primitiveBindings,
      witnesses: evidence,
      qualifiedWithinActualLocalConstruction: true,
      genericNativeContextReplaced: false,
      productionContextQualified: false,
    };
  });
  const ownerKeys = new Set(allFunctions.map(row => JSON.stringify(row.owner)));
  const rawReferences = [];
  for (const [batchIndex, batch] of native.rawGraph.m4Contexts.affectedLineage.batches.entries())
    for (const [observationIndex, row] of batch.observations.entries())
      if (ownerKeys.has(JSON.stringify(row.owner)))
        rawReferences.push({
          batchIndex,
          observationIndex,
          inventoryIndices: row.inventoryIndices,
          occurrences: row.occurrences,
          context: row.context,
          definingContext: row.definingContext,
          disposition: 'retained current fresh native context; no allocation/subtraction',
        });
  return {
    version: 1,
    kind: 'fixed-owned-assignment-context-refinement',
    contextSha256: runtime.contextSha256,
    runtimeReportSha256: runtime.reportSha256,
    imageDigest: runtime.imageDigest,
    sourcePolicyDigest: source.policyDigest,
    profiles,
    originalNativeReferences: {
      namespace: 'current-fresh-native-source',
      historicalOriginalCohortReused: false,
      selectedIdentities: native.rawGraph.m4Contexts.selectedIdentities.length,
      observations: native.rawGraph.m4Contexts.observations.length,
      contextOccurrences: native.rawGraph.m4Contexts.observations.reduce(
        (n, row) => n + row.occurrences,
        0
      ),
      lineageEntries: selected.entries.length,
      rawReferences,
    },
    scope:
      'same actual fresh restricted local constructor family and fixed scalar builder semantics only',
    unresolvedContexts: [
      'all test/foreign/other factory configurations and generic null/open/escaped frames retain their original obligations',
      'hosted ingress, production TLS/provider delivery and universal compiler correctness are not inferred',
      'no correspondence allocates the newly qualified construction to an old aggregate native occurrence',
    ],
    acceptedCoverage: 0,
    nativeAdmission: false,
    productionCCredit: 0,
    allExecutableContextsQualified: false,
    completeEffectQualified: false,
  };
}
export function linkOwnedAssignmentContexts({
  native,
  source,
  runtime,
  event,
  contract,
  fixedLinks,
}) {
  // A public/mocked constructor's JSON can never cross this existing private brand.
  const imageRecords = assertM4RuntimeImageRecords(
    runtime,
    event.context,
    hash(JSON.stringify(PROVIDER_UNIT_POLICY))
  );
  const primitiveBindings = qualifyAssignmentPrimitiveBindings(imageRecords, contract);
  for (const file of [
    'apps/web/src/server/operations/m4-private-runtime.ts',
    'apps/web/src/server/operations/m4-private-runtime-context.ts',
    'apps/web/src/server/operations/m4-ops-controller.ts',
    'apps/web/src/features/admin/claims/actions/ops-assignment.ts',
    'apps/web/src/server/operations/m4-assignment-kernel-shared.ts',
    'apps/web/src/server/operations/m4-legacy-assignment-kernel.ts',
    'apps/web/src/server/operations/m4-staff-assignment-kernel.ts',
  ])
    if (source.sourceRecords[file]?.sha256 !== imageRecords[file]?.sha256)
      fail('same executed source ' + file);
  return deriveAssignmentContextRefinements({
    native,
    source,
    runtime,
    event,
    fixedLinks,
    primitiveBindings,
  });
}
