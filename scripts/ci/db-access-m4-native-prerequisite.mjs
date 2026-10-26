import { collectInventory } from './db-access-inventory.mjs';
import { randomUUID } from 'node:crypto';
import { encodeInventory } from './db-access-inventory-wire.mjs';
import { isOwnedM4WorkerEvidence } from './db-access-graph-worker-pool.mjs';
import { digest } from './db-access-trust.mjs';
import { isVerifiedM4ProofSource, m4SourceMatchesModel } from './db-access-m4-proof-source.mjs';
import { createProvenance } from './db-access-provenance.mjs';
import {
  isVerifiedProviderUnitSource,
  providerUnitAnalysisModel,
} from './db-access-provider-unit-source.mjs';

const collected = new WeakSet();
const workerRequests = new WeakMap();
const consumedWorkerRequests = new WeakSet();
const fail = reason => {
  throw Error('incomplete: m4 native prerequisite ' + reason);
};
// Called by completeGuardPreparation with its full authenticated model/provenance.
// There is intentionally no array-of-rows or serialized-receipt entry point.
export function collectM4NativeInventory(model, trusted, unit) {
  if (!isVerifiedProviderUnitSource(unit)) fail('provider source brand');
  const source = unit.m4Proof;
  if (!m4SourceMatchesModel(source, model)) fail('source/model brand');
  const provenance = createProvenance(providerUnitAnalysisModel(model, unit, true));
  const inventory = collectInventory(model, provenance, trusted);
  if (!m4SourceMatchesModel(source, model)) fail('source changed during actual collection');
  const result = Object.freeze({
    inventory,
    source,
    model,
    runtimeAdmission: false,
  });
  collected.add(result);
  return result;
}

// The caller cannot substitute rows: compare the entire encoding with the parent's
// actual privately branded collection, including changed roots, owners and posture.
export function bindM4WorkerRequest(native, input) {
  if (!collected.has(native) || !m4SourceMatchesModel(native.source, native.model))
    fail('worker request source/native brand');
  const expected = encodeInventory(native);
  if (
    !/^[a-f0-9]{64}$/u.test(input?.snapshot ?? '') ||
    JSON.stringify(input.inventory) !== JSON.stringify(expected)
  )
    fail('worker request complete inventory');
  const request = Object.freeze({
    version: 1,
    requestId: randomUUID(),
    snapshot: input.snapshot,
    inventoryDigest: digest(JSON.stringify(expected)),
    inventoryCount: expected.entries.length,
    modelDigest: digest(JSON.stringify([...native.model.sources])),
    sourcePolicyDigest: native.source.policyDigest,
    sourceBookends: native.source.bookends,
    runtimeAdmission: false,
  });
  workerRequests.set(request, native);
  return request;
}
export function assertM4WorkerRequestCurrent(request) {
  const native = workerRequests.get(request);
  if (
    !native ||
    !m4SourceMatchesModel(native.source, native.model) ||
    digest(JSON.stringify([...native.model.sources])) !== request.modelDigest ||
    digest(JSON.stringify(encodeInventory(native))) !== request.inventoryDigest
  )
    fail('worker request identity/source drift');
}
export function consumeM4WorkerRequest(request, input) {
  assertM4WorkerRequestCurrent(request);
  if (consumedWorkerRequests.has(request)) fail('replayed worker request');
  if (
    input.snapshot !== request.snapshot ||
    digest(JSON.stringify(input.inventory)) !== request.inventoryDigest
  )
    fail('worker request input mismatch');
  consumedWorkerRequests.add(request);
}

export function m4NativePrerequisites(source, native, graph, failures) {
  if (!isVerifiedM4ProofSource(source) || !collected.has(native) || native.source !== source)
    fail('native/source brand');
  if (
    graph.m4WorkerTransport &&
    (!isOwnedM4WorkerEvidence(graph.m4WorkerTransport) ||
      graph.m4WorkerTransport.sourcePolicyDigest !== source.policyDigest ||
      graph.m4WorkerTransport.inventoryDigest !== digest(JSON.stringify(encodeInventory(native))))
  )
    fail('foreign worker transport evidence');
  const files = new Set(source.files);
  const operations = native.inventory.entries
    .filter(entry => files.has(entry.file))
    .map(entry => {
      const observed = graph.failures.filter(row => row.identity === entry.identity);
      return Object.freeze({
        identity: entry.identity,
        file: entry.file,
        line: entry.line,
        method: entry.method,
        tenantPosture: entry.tenantPosture,
        tenantPostureReason: entry.tenantPostureReason,
        dispatchAlternatives: entry.dispatchAlternatives,
        observedFailingContexts: [...new Set(observed.map(row => row.mountedFrom))].sort(),
        presentInFailureSet: failures.has(entry.identity),
        allExecutableContextsQualified: false,
        runtimeAdmission: false,
      });
    });
  // graph.failures contains failing mounts only. It cannot prove census completeness;
  // neither empty diagnostics nor a matching list supplied by the caller can close this.
  const unresolved = [
    {
      file: '<m4-native-runtime-and-all-contexts>',
      reason:
        'M4 source authenticated; complete native executable-context census and same-event executed runtime proof are required',
      occurrences: 1,
    },
  ];
  return Object.freeze({
    sourcePolicyDigest: source.policyDigest,
    sourceBookends: source.bookends,
    nativeInventoryCount: native.inventory.entries.length,
    nativeIdentitiesDigest: digest(
      JSON.stringify(native.inventory.entries.map(row => row.identity))
    ),
    operations: Object.freeze(operations),
    unresolved: Object.freeze(unresolved),
    nativeInventoryCollected: true,
    contextCensusComplete: false,
    runtimeEvidenceAccepted: false,
    ownedWorkerTransportVerified: Boolean(graph.m4WorkerTransport),
    runtimeAdmission: false,
    sourcePremiseOnly: true,
  });
}
