import { randomUUID } from 'node:crypto';
import { runM4Runtime, hasM4RuntimeBinding } from './db-access-m4-runtime.mjs';
import {
  evaluateM4NativeSession,
  assertM4NativeSessionEvent,
} from './db-access-m4-native-session.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import { hash } from './db-access-provider-runtime-identity.mjs';
import { freezeOutput, outputShape } from './db-access-output-binding.mjs';

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
  const runtime = runM4Runtime(input);
  const native = await evaluateM4NativeSession(input.candidate, event);
  const handle = Object.freeze({ version: 1, id: randomUUID() });
  pairs.set(handle, { runtime, native });
  return handle;
}

// Called after the outer producer's final source/event bookends. The projection
// is evidence only; serializing it never restores either private live handle.
export function assertM4Pairing(handle, input) {
  const state = pairs.get(handle);
  if (!state || input.policy !== PROVIDER_UNIT_POLICY) fail('foreign handle/policy');
  const event = { gitDir: input.gitDir, context: input.context };
  outputShape(event);
  const policySha256 = hash(JSON.stringify(PROVIDER_UNIT_POLICY));
  if (!hasM4RuntimeBinding(state.runtime, input.context, policySha256))
    fail('runtime event/policy');
  const native = assertM4NativeSessionEvent(state.native, event);
  return freezeOutput({
    report: native.report,
    checkpoint: {
      version: 1,
      contextSha256: state.runtime.contextSha256,
      policySha256,
      nativeOutputDigest: state.native.outputDigest,
      nativeSourcePolicyDigest: native.sourcePolicyDigest,
      nativeEvent: native.eventBinding,
      runtime: state.runtime,
      // The raw report and context rows remain exclusively in the same native
      // session; this small projection does not duplicate their large arrays.
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
