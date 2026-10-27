import { parentPort, workerData, isMainThread } from 'node:worker_threads';
import { ADOPTION } from './db-access-adoption.mjs';
import { authenticateSnapshot } from './db-access-trust.mjs';
import { outputShape } from './db-access-output-binding.mjs';
import { computePriorControls } from './db-access-prior-controls.mjs';
import {
  PRIOR_MESSAGE,
  currentPriorBinding,
  trustedDigest,
  priorFailure,
} from './db-access-m4-prior-source.mjs';

if (isMainThread || !parentPort) throw priorFailure('fixed worker channel required');
const { repoRoot, event, nonce } = workerData ?? {};
if (typeof repoRoot !== 'string' || typeof nonce !== 'string' || !event)
  throw priorFailure('worker input');
const binding = currentPriorBinding(repoRoot, event);
const trusted = authenticateSnapshot(repoRoot, ADOPTION);
const snapshotDigest = trustedDigest(trusted);
const controls = computePriorControls(trusted);
if (
  currentPriorBinding(repoRoot, event) !== binding ||
  trustedDigest(trusted) !== snapshotDigest ||
  trustedDigest(authenticateSnapshot(repoRoot, ADOPTION)) !== snapshotDigest
)
  throw priorFailure('worker source/event bookend');
parentPort.postMessage({
  type: PRIOR_MESSAGE,
  nonce,
  binding,
  snapshotDigest,
  controlsDigest: outputShape(controls).digest,
  controls,
});
parentPort.once('message', message => {
  if (
    !message ||
    Object.getPrototypeOf(message) !== Object.prototype ||
    Object.keys(message).sort().join(',') !== 'binding,nonce,type' ||
    message.type !== 'M4_LOADER_RELEASE' ||
    message.nonce !== nonce ||
    message.binding !== binding ||
    currentPriorBinding(repoRoot, event) !== binding
  )
    throw priorFailure('loader release');
  parentPort.close();
});
