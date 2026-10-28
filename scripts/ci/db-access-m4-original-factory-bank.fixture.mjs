// Explicit pure-unit data double; it cannot create a fresh capsule/native capability.
import { acceptanceFixture } from './db-access-m4-private-test.fixture.mjs';
export function addOriginalFactoryBankFixture(input) {
  const factory = acceptanceFixture();
  input.native.inventory = factory.native.inventory;
  input.native.raw = factory.native.raw;
  input.native.rawGraph = factory.native.rawGraph;
  input.ordinary.sourceBefore = factory.ordinary.sourceBefore;
  input.ordinary.parentBefore = factory.ordinary.parentBefore;
  input.ordinary.originalFactoryBank = {
    kind: 'fresh-original-admin-factory-nine',
    imageId: 'explicit-unit-original-factory-image',
    sourceContext: JSON.stringify(input.event.context),
    sourceBefore: input.ordinary.sourceBefore,
    parentBefore: input.ordinary.parentBefore,
    ordinaryArtifactDigest: input.ordinary.ordinaryArtifactDigest,
    execution: factory.ordinary.execution,
    directFactoryCoverageObserved: false,
    productionCCredit: 0,
    nativeAdmission: false,
  };
  return input;
}
