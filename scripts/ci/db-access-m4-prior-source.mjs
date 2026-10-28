import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ADOPTION } from './db-access-adoption.mjs';
import { assertM4NativeGitRoot } from './db-access-m4-native-event.mjs';
import { assertWorkerCode } from './db-access-graph-workers.mjs';
import { digest } from './db-access-trust.mjs';
import { outputShape, freezeOutput } from './db-access-output-binding.mjs';

export const PRIOR_MESSAGE = 'm4-prior-controls/1';
export const priorFailure = reason => Error('incomplete: M4 prior preparation ' + reason);
const ownRoot = fs.realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
export function trustedDigest(trusted) {
  if (!(trusted instanceof Map)) throw priorFailure('historical Map shape');
  return digest(JSON.stringify([...trusted]));
}
export function priorEvent(event) {
  outputShape(event);
  return freezeOutput({
    gitDir: fs.realpathSync(event.gitDir),
    context: structuredClone(event.context),
  });
}
function policyDigest(root) {
  const file = root + '/scripts/ci/db-access-provider-unit-policy.json';
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(file) !== file)
    throw priorFailure('policy file shape');
  return digest(fs.readFileSync(file));
}
// Candidate and actually executing producer URLs are both checked. The policy bytes
// and event remain bound even when those roots are distinct frozen exports.
export function currentPriorBinding(repoRoot, event) {
  const root = fs.realpathSync(repoRoot);
  assertWorkerCode(root);
  if (root !== ownRoot) assertWorkerCode(ownRoot);
  assertM4NativeGitRoot(root, event);
  return outputShape({
    root,
    ownRoot,
    adoption: ADOPTION,
    event: priorEvent(event),
    candidatePolicy: policyDigest(root),
    producerPolicy: policyDigest(ownRoot),
  }).digest;
}
const sameKeys = (value, names) =>
  value &&
  Object.getPrototypeOf(value) === Object.prototype &&
  Object.keys(value).length === names.length &&
  names.every(name => Object.hasOwn(value, name));
const row = value =>
  value === undefined ||
  (value &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).every(key => !key.startsWith('_')));
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
// Validation is data-only; no exported function can register or admit a supplied result.
export function validatePriorMessage(state, message) {
  outputShape(message);
  const controls = message?.controls;
  if (
    !sameKeys(message, [
      'type',
      'nonce',
      'binding',
      'snapshotDigest',
      'controlsDigest',
      'controls',
    ]) ||
    message.type !== PRIOR_MESSAGE ||
    message.nonce !== state.nonce ||
    message.binding !== state.binding ||
    !hex(message.snapshotDigest) ||
    !hex(message.controlsDigest) ||
    !sameKeys(controls, [
      'analysisUnknown',
      'statusReturnPriorRow',
      'claimHistoryPriorRow',
      'priorScoped',
    ]) ||
    !Array.isArray(controls.analysisUnknown) ||
    !controls.analysisUnknown.every(value => typeof value === 'string') ||
    new Set(controls.analysisUnknown).size !== controls.analysisUnknown.length ||
    !Array.isArray(controls.priorScoped) ||
    !controls.priorScoped.every(value => typeof value === 'string') ||
    new Set(controls.priorScoped).size !== controls.priorScoped.length ||
    !row(controls.statusReturnPriorRow) ||
    !row(controls.claimHistoryPriorRow) ||
    outputShape(controls).digest !== message.controlsDigest
  )
    throw priorFailure('foreign/invalid result');
  return freezeOutput({
    snapshotDigest: message.snapshotDigest,
    controlsDigest: message.controlsDigest,
    controls,
  });
}
