import {
  executeM4CompiledRuntime,
  takeM4CompiledRuntimeForJoin,
} from './db-access-m4-compiled-producer-loader.mjs';
import { linkM4CompiledConstructionContexts } from './db-access-m4-compiled-context-bridge.mjs';
import { projectFixedPrivateAcceptance } from './db-access-m4-private-acceptance-data.mjs';
import { runFixedM4P2, takeFixedM4P2ForJoin } from './db-access-m4-p2-ordinary.mjs';
import { describeM4ContextInspection } from './db-access-m4-context-projection.mjs';
import { describeM4PairGaps } from './db-access-m4-gap-ledger.mjs';
import { linkM4EffectAssertions } from './db-access-m4-effect-assertions.mjs';
import { randomUUID } from 'node:crypto';
import { runM4Runtime, hasM4RuntimeBinding } from './db-access-m4-runtime.mjs';
import { evaluateM4NativeSession } from './db-access-m4-native-session.mjs';
import {
  startM4PriorPreparation,
  waitM4PriorPreparation,
  closeM4PriorPreparation,
} from './db-access-m4-prior-preparation.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import { hash } from './db-access-provider-runtime-identity.mjs';
import { freezeOutput, outputShape } from './db-access-output-binding.mjs';
import {
  openM4WorkerLoaderSession,
  finishM4WorkerLoaderSession,
  assertM4WorkerLoaderProofCurrent,
  abortM4WorkerLoaderSession,
} from './db-access-m4-worker-loader-authority.mjs';

const pairs = new WeakMap();
const fail = reason => {
  throw Error('incomplete: M4 non-admitting pair ' + reason);
};

// Lexical private acceptance entry: no serialized row/projection can enter pairs.
function acceptOwnedPrivateConstruction(
  state,
  input,
  native,
  source,
  event,
  effectAssertions,
  workerLoaderInspection
) {
  state.ordinaryTaken = true;
  const ordinaryExecution = takeFixedM4P2ForJoin(state.ordinary, input);
  const compiledTaken = takeM4CompiledRuntimeForJoin(
    state.compiled,
    input.context,
    state.runtime.policySha256
  );
  const compiledConstruction = linkM4CompiledConstructionContexts({
    native,
    source,
    runtime: state.runtime,
    compiledTaken,
    event,
    effectAssertions,
    workerLoaderInspection,
    candidateRoot: input.candidate,
  });
  const privateAcceptance = projectFixedPrivateAcceptance({
    compiledConstruction,
    native,
    nativeOutputDigest: state.native.outputDigest,
    runtime: state.runtime,
    ordinary: ordinaryExecution,
    event,
    effectAssertions,
    workerLoaderInspection,
  });
  // All three real local mounted routes and the current isolated proof program are required.
  // Historical factory rows and whole original/native contexts receive no implicit credit.
  const profiles = ['legacy-admin', 'legacy-agent', 'staff'];
  const cases = [
    'mounted-admin-assignment-source-route',
    'mounted-agent-assignment-source-route',
    'mounted-staff-assignment-source-route',
  ];
  const decisions = privateAcceptance.mountedAssignment?.localDecisions;
  if (
    privateAcceptance.boundedCompiledConstructionQualified !== true ||
    privateAcceptance.compiledConstruction?.scopedConstructionQualified !== true ||
    privateAcceptance.construction?.kind !== 'm4-current-qualification-proof-construction' ||
    privateAcceptance.construction.currentProofClassQualified !== true ||
    privateAcceptance.construction.localQualificationOnly !== true ||
    privateAcceptance.construction.nextActionIngressQualified !== false ||
    privateAcceptance.construction.acceptedOldIdentityCount !== 0 ||
    privateAcceptance.originalFactoryBank?.kind !==
      'current-original-restored-factory-acceptance' ||
    privateAcceptance.originalFactoryBank.originalSelectedTrustedCohortAccepted !== false ||
    privateAcceptance.originalFactoryBank.accounting.acceptedOriginalIdentities.length !== 2 ||
    privateAcceptance.originalFactoryBank.decisions.some(
      row => row.completeIdentityContextConjunction !== true
    ) ||
    privateAcceptance.currentLocalConstructionQualified !== true ||
    !Array.isArray(decisions) ||
    decisions.length !== 3 ||
    decisions.some(
      (row, index) =>
        row.profile !== profiles[index] ||
        row.qualifiedLocalQualificationConstruction !== true ||
        row.adapterActuallyExecuted !== true ||
        row.wholeOriginalIdentityQualified !== false ||
        row.nextDeploymentQualified !== false ||
        !Array.isArray(row.executedRoutes) ||
        row.executedRoutes.length !== 1 ||
        row.executedRoutes[0].caseId !== cases[index] ||
        row.executedRoutes[0].profile !== profiles[index]
    )
  )
    fail('semantic missing current mounted trusted/proof construction');

  return { ordinaryExecution, privateAcceptance };
}

// Sole construction path: actual fixed runtime execution, then exactly one actual
// native evaluation. No supplied observations, receipts or alternate evaluators.
export async function executeM4Pairing(input) {
  if (input.policy !== PROVIDER_UNIT_POLICY) fail('foreign policy');
  const event = { gitDir: input.gitDir, context: input.context };
  outputShape(event);
  const ordinary = await runFixedM4P2(input);
  // Required phases are sequential: local SQL, actual strict compiled platform, then native workers.
  // The platform owner closes every child before returning its private result.
  let prior, runtime, compiled, native, loaderProof, loader, complete;
  try {
    runtime = runM4Runtime(input);
    compiled = await executeM4CompiledRuntime({ ...input, databaseUrl: input.compiledDatabaseUrl });
    loader = openM4WorkerLoaderSession({
      candidate: input.candidate,
      producer: input.producer,
      event,
    });
    prior = startM4PriorPreparation(input.candidate, event, loader);
    await waitM4PriorPreparation(prior);
    native = await evaluateM4NativeSession(input.candidate, event, prior, loader);
    loaderProof = finishM4WorkerLoaderSession(loader);
    complete = true;
  } finally {
    if (prior) await closeM4PriorPreparation(prior);
    if (loader && !complete) await abortM4WorkerLoaderSession(loader);
  }
  const handle = Object.freeze({ version: 1, id: randomUUID() });
  pairs.set(handle, { runtime, compiled, native, loaderProof, ordinary, ordinaryTaken: false });
  return handle;
}

// Called after the outer producer's final source/event bookends. The projection
// is evidence only; serializing it never restores either private live handle.
export function assertM4Pairing(handle, input) {
  const state = pairs.get(handle);
  if (!state || input.policy !== PROVIDER_UNIT_POLICY) fail('foreign handle/policy');
  if (state.ordinaryTaken) fail('ordinary result already consumed');
  const event = { gitDir: input.gitDir, context: input.context };
  outputShape(event);
  const workerLoaderInspection = assertM4WorkerLoaderProofCurrent(state.loaderProof, {
    producer: input.producer,
    event,
  });
  const policySha256 = hash(JSON.stringify(PROVIDER_UNIT_POLICY));
  if (!hasM4RuntimeBinding(state.runtime, input.context, policySha256))
    fail('runtime event/policy');
  const { native, effectAssertions, source } = linkM4EffectAssertions(
    state.native,
    state.runtime,
    event
  );
  state.effectAssertions ??= effectAssertions;
  // Cache only after both existing private bindings have been revalidated.
  state.gapLedger ??= describeM4PairGaps(native, state.native.outputDigest, state.runtime);
  const contextInspection = describeM4ContextInspection(
    native,
    state.native.outputDigest,
    state.runtime
  );
  // Root merge point: finite premise/context checks reuse the native view above.
  const { ordinaryExecution, privateAcceptance } = acceptOwnedPrivateConstruction(
    state,
    input,
    native,
    source,
    event,
    effectAssertions,
    workerLoaderInspection
  );
  return freezeOutput({
    report: native.report,
    gapLedger: state.gapLedger,
    effectAssertions: state.effectAssertions,
    checkpoint: {
      version: 1,
      workerLoaderInspection,
      ordinaryExecution,
      privateAcceptance,
      compiledRuntime: state.compiled,
      contextInspection,
      gapLedger: state.gapLedger,
      contextSha256: state.runtime.contextSha256,
      policySha256,
      nativeOutputDigest: state.native.outputDigest,
      nativeSourcePolicyDigest: native.sourcePolicyDigest,
      nativeEvent: native.eventBinding,
      // Clone already-validated data for independent index/occurrence review.
      // Even plain-looking WeakMap keys inside graph data lose their identity.
      nativeConstructionData: structuredClone(native),
      runtime: state.runtime,
      // Full diagnostic/failure arrays remain in the native session/report.
      // The finite context projection names their original index spaces.
      runtimeEvidenceAccepted: false,
      runtimeAdmission: false,
      nativeAdmission: false,
      allExecutableContextsQualified: false,
      productionCCredit: 0,
      unresolvedPremises: [
        'complete T/P source derivations and actual-context correspondence',
        'authenticated semantic-negative native join',
        'P2 ordinary execution and complete source/loader contexts',
      ],
    },
  });
}
