import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { digest } from './db-access-trust.mjs';
import { m4SourceMatchesModel } from './db-access-m4-proof-source.mjs';
import { encodeInventory } from './db-access-inventory-wire.mjs';

const received = new WeakSet();
const hydrated = new WeakMap();
export function isM4HydratedContextInventory(model, inventory, source) {
  const bound = hydrated.get(inventory);
  return (
    !isMainThread &&
    bound?.model === model &&
    bound?.source === source &&
    bound.digest === digest(JSON.stringify(encodeInventory({ model, inventory })))
  );
}
const authorized = new WeakMap();
let session;
const fail = reason => {
  throw Error('incomplete: m4 worker transport ' + reason);
};
// Only exact message objects delivered by this actual parentPort are eligible.
// Importing the function in a main thread or passing deserialized JSON cannot mint a capability.
if (!isMainThread && parentPort)
  parentPort.on('message', input => {
    if (input && typeof input === 'object') received.add(input);
  });
function validate(input, prepared) {
  const wire = input?.m4Transport;
  if (
    isMainThread ||
    !received.has(input) ||
    !wire ||
    wire.channelId !== workerData.m4ChannelId ||
    typeof wire.requestId !== 'string' ||
    input.snapshot !== wire.snapshot ||
    wire.sourcePolicyDigest !== prepared.providerUnit?.m4Proof?.policyDigest ||
    JSON.stringify(wire.sourceBookends) !==
      JSON.stringify(prepared.providerUnit.m4Proof.bookends) ||
    wire.modelDigest !== digest(JSON.stringify([...prepared.model.sources])) ||
    !m4SourceMatchesModel(prepared.providerUnit.m4Proof, prepared.model)
  )
    fail('channel/source/model/request identity');
  return wire;
}
export function authorizeM4WorkerInput(input, prepared) {
  const wire = validate(input, prepared);
  if (
    session ||
    input.type !== 'RUN' ||
    !Number.isSafeInteger(input.jobId) ||
    digest(JSON.stringify(input.inventory)) !== wire.inventoryDigest ||
    input.inventory.entries.length !== wire.inventoryCount
  )
    fail('setup/replay/complete inventory');
  authorized.set(input, prepared.model);
  session = { wire, prepared };
}
export function isAuthorizedM4WorkerInput(input, model) {
  return !isMainThread && received.has(input) && authorized.get(input) === model;
}
export function assertM4HydratedInventory(input, prepared) {
  if (
    !isAuthorizedM4WorkerInput(input, prepared.model) ||
    digest(JSON.stringify(encodeInventory(prepared))) !== input.m4Transport.inventoryDigest
  )
    fail('hydrated inventory differs');
  hydrated.set(prepared.inventory, {
    model: prepared.model,
    source: prepared.providerUnit.m4Proof,
    digest: input.m4Transport.inventoryDigest,
  });
}
function acknowledgement(input, prepared, used) {
  const wire = validate(input, prepared);
  if (session && JSON.stringify(wire) !== JSON.stringify(session.wire))
    fail('changed session identity');
  return {
    channelId: wire.channelId,
    requestId: wire.requestId,
    snapshot: wire.snapshot,
    inventoryDigest: wire.inventoryDigest,
    inventoryCount: wire.inventoryCount,
    modelDigest: wire.modelDigest,
    sourcePolicyDigest: wire.sourcePolicyDigest,
    sourceBookends: wire.sourceBookends,
    used,
  };
}
export function m4WorkerResult(input) {
  if (!session || input.type !== 'RUN') fail('result outside authenticated session');
  return {
    ...acknowledgement(input, session.prepared, true),
    jobId: input.jobId,
  };
}
export function m4WorkerDone(input, prepared) {
  if (input.type !== 'STOP') fail('done outside STOP');
  return acknowledgement(input, prepared, Boolean(session));
}
