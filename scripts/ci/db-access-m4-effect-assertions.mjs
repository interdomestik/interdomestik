// Integrates one finite correspondence into the actual private pair. No discharge.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertM4NativeProofSource } from './db-access-m4-native-session.mjs';
import { assertM4RuntimeImageRecords } from './db-access-m4-runtime.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import { exact, hash } from './db-access-provider-runtime-identity.mjs';
import { freezeOutput } from './db-access-output-binding.mjs';
import {
  mandatoryM4Assertion,
  assertM4AwaitedCaseRunner,
} from './db-access-m4-assertion-nodes.mjs';
import {
  M4_KERNEL_ASSERTION_CASE,
  M4_KERNEL_ASSERTION_FILE,
  M4_KERNEL_ASSERTION_PROGRAM,
  M4_KERNEL_ASSERTION_LINKS,
} from './db-access-m4-kernel-assertion-contract.mjs';

const kernelFile = 'apps/web/src/features/admin/claims/actions/ops-assignment.ts';
const fail = reason => {
  throw Error('M4 effect/assertion join refused: ' + reason);
};
export function linkM4EffectAssertions(nativeHandle, runtime, event) {
  const source = assertM4NativeProofSource(nativeHandle, event);
  const records = assertM4RuntimeImageRecords(
    runtime,
    event.context,
    hash(JSON.stringify(PROVIDER_UNIT_POLICY))
  );
  if (records[kernelFile]?.sha256 !== source.sourceRecords[kernelFile]?.sha256)
    fail('kernel differs between native source and executed runtime image');
  if (!runtime.completion.profileCaseIds.includes(M4_KERNEL_ASSERTION_CASE))
    fail('fixed case did not complete');
  const producer = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const fixturePath = 'scripts/ci/' + M4_KERNEL_ASSERTION_FILE;
  const fixture = exact(producer, fixturePath, PROVIDER_UNIT_POLICY.producerFiles[fixturePath]);
  if (records[M4_KERNEL_ASSERTION_FILE]?.sha256 !== hash(fixture))
    fail('fixture differs from actual executed sealed image');
  const parentName = 'db-access-m4-runtime-fixture.mjs';
  const parentPath = 'scripts/ci/' + parentName;
  const parent = exact(producer, parentPath, PROVIDER_UNIT_POLICY.producerFiles[parentPath]);
  if (records[parentName]?.sha256 !== hash(parent)) fail('parent differs from executed image');
  assertM4AwaitedCaseRunner(parent.toString('utf8'));
  const effects = source.derivations.kernel.facts.effects;
  const links = M4_KERNEL_ASSERTION_LINKS.map(link => {
    const matches = effects.flatMap((effect, index) =>
      effect.step === link.step ? [{ effect, index }] : []
    );
    if (matches.length !== 1) fail('missing or duplicate derived source effect ' + link.step);
    const { effect, index } = matches[0];
    return {
      step: link.step,
      source: {
        file: kernelFile,
        sha256: source.sourceRecords[kernelFile].sha256,
        derivation: '/derivations/kernel/facts/effects/' + index,
        effectSha256: hash(JSON.stringify(effect)),
      },
      assertions: link.assertions.map(expression =>
        mandatoryM4Assertion(
          fixture.toString('utf8'),
          fixturePath,
          M4_KERNEL_ASSERTION_CASE,
          expression,
          M4_KERNEL_ASSERTION_PROGRAM
        )
      ),
      scope: link.scope,
    };
  });
  return freezeOutput({
    version: 1,
    kind: 'm4-finite-source-effect-executed-assertion-correspondence',
    sourcePolicyDigest: source.policyDigest,
    runtimeReportSha256: runtime.reportSha256,
    contextSha256: runtime.contextSha256,
    fixtureSha256: hash(fixture),
    imageDigest: runtime.imageDigest,
    links,
    unresolvedKernelEffects: effects.filter(
      effect => !links.some(link => link.step === effect.step)
    ),
    otherSourceDerivationsUnmapped: Object.keys(source.derivations).filter(key => key !== 'kernel'),
    correspondenceComplete: false,
    acceptedCoverage: 0,
    nativeAdmission: false,
    productionCCredit: 0,
  });
}
