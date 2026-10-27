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

// Sole construction path: actual fixed runtime execution, then exactly one actual
// native evaluation. No supplied observations, receipts or alternate evaluators.
export async function executeM4Pairing(input) {
  if (input.policy !== PROVIDER_UNIT_POLICY) fail('foreign policy');
  const event = { gitDir: input.gitDir, context: input.context };
  outputShape(event);
  const loader = openM4WorkerLoaderSession({
    candidate: input.candidate,
    producer: input.producer,
    event,
  });
  // Historical ADOPTION work shares the measured SQL phase, then exits before native preparation.
  let prior, runtime, native, loaderProof, complete;
  try {
    prior = startM4PriorPreparation(input.candidate, event, loader);
    runtime = runM4Runtime(input);
    await waitM4PriorPreparation(prior);
    native = await evaluateM4NativeSession(input.candidate, event, prior, loader);
    loaderProof = finishM4WorkerLoaderSession(loader);
    complete = true;
  } finally {
    if (prior) await closeM4PriorPreparation(prior);
    if (!complete) await abortM4WorkerLoaderSession(loader);
  }
  const handle = Object.freeze({ version: 1, id: randomUUID() });
  pairs.set(handle, { runtime, native, loaderProof });
  return handle;
}

// Called after the outer producer's final source/event bookends. The projection
// is evidence only; serializing it never restores either private live handle.
export function assertM4Pairing(handle, input) {
  const state = pairs.get(handle);
  if (!state || input.policy !== PROVIDER_UNIT_POLICY) fail('foreign handle/policy');
  const event = { gitDir: input.gitDir, context: input.context };
  outputShape(event);
  const workerLoaderInspection = assertM4WorkerLoaderProofCurrent(state.loaderProof, {
    producer: input.producer,
    event,
  });
  const policySha256 = hash(JSON.stringify(PROVIDER_UNIT_POLICY));
  if (!hasM4RuntimeBinding(state.runtime, input.context, policySha256))
    fail('runtime event/policy');
  const { native, effectAssertions } = linkM4EffectAssertions(state.native, state.runtime, event);
  state.effectAssertions ??= effectAssertions;
  // Cache only after both existing private bindings have been revalidated.
  state.gapLedger ??= describeM4PairGaps(native, state.native.outputDigest, state.runtime);
  const contextInspection = describeM4ContextInspection(
    native,
    state.native.outputDigest,
    state.runtime
  );
  return freezeOutput({
    report: native.report,
    gapLedger: state.gapLedger,
    effectAssertions: state.effectAssertions,
    checkpoint: {
      version: 1,
      workerLoaderInspection,
      contextInspection,
      gapLedger: state.gapLedger,
      contextSha256: state.runtime.contextSha256,
      policySha256,
      nativeOutputDigest: state.native.outputDigest,
      nativeSourcePolicyDigest: native.sourcePolicyDigest,
      nativeEvent: native.eventBinding,
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
