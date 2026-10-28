import { sourceSnapshot, candidateSnapshot, validateCapsule } from './runtime-source.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { authenticateRuntimeContext } from '../db-access-provider-runtime-identity.mjs';
import { validateP2Observation, validateLegacyP2Observation } from './observations.mjs';
import {
  materializeFixedLegacyBank,
  assertFixedLegacyBankCurrent,
  legacyBankPartition,
  validateLegacyCapsule,
} from './legacy-bank.mjs';
import { P2_SOURCE, LEGACY_P2_SOURCE, partitionOrdinarySources } from './source-fence.mjs';
const PREFIX = 'scripts/ci/p2/';
const fresh = new WeakMap();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => {
  throw Error('required P2 runtime refused: ' + message);
};
async function runBackend(root, output) {
  // This is trusted producer Python; the separately bounded Docker collector owns untrusted bytes.
  const child = spawn('/usr/bin/python3', ['-B', path.join(root, 'linux_backend.py'), output], {
    cwd: root,
    env: {
      PATH: '/usr/bin:/bin:/usr/local/bin',
      LANG: 'C.UTF-8',
      TZ: 'UTC',
      PYTHONDONTWRITEBYTECODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const chunks = [];
  let bytes = 0,
    failure;
  const timer = setTimeout(() => {
    failure = Error('P2 backend deadline');
    child.kill('SIGTERM');
  }, 300000);
  for (const pipe of [child.stdout, child.stderr])
    pipe.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 65536) {
        failure = Error('P2 backend output cap');
        child.kill('SIGTERM');
      } else chunks.push(chunk);
    });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  }).finally(() => clearTimeout(timer));
  if (failure) throw failure;
  if (code !== 0)
    fail('fixed Linux backend failed: ' + Buffer.concat(chunks).toString('utf8').slice(-1000));
  return JSON.parse(fs.readFileSync(path.join(output, 'result.json'), 'utf8'));
}
// Called directly by the authenticated, pinned required producer, never by candidate proof JSON.
export async function runRequiredP2Runtime(options) {
  return executeFixedRuntime(options, false);
}
export async function runRequiredLegacyP2Runtime(options) {
  return executeFixedRuntime(options, true);
}
async function executeFixedRuntime(
  { candidateRoot, producerRoot, gitDir, context, outputRoot },
  legacy
) {
  const roots = [candidateRoot, producerRoot, outputRoot].map(root => fs.realpathSync(root));
  if (
    roots.some((root, i) =>
      roots.some((other, j) => i !== j && (root === other || root.startsWith(other + path.sep)))
    )
  )
    fail('candidate/producer/output authority roots must be disjoint');
  if (candidateRoot !== roots[0] || producerRoot !== roots[1] || outputRoot !== roots[2])
    fail('canonical authority roots required');
  const frozenContext = structuredClone(context);
  authenticateRuntimeContext(gitDir, frozenContext);
  const parentBefore = sourceSnapshot(producerRoot, gitDir, frozenContext);
  const root = path.join(producerRoot, PREFIX),
    policy = JSON.parse(fs.readFileSync(path.join(root, 'policy.json')));
  if (
    policy.version !== 1 ||
    policy.scope !== 'exact-dual-fixed-ten-plus-nine' ||
    policy.baseline !== 604 ||
    policy.repository !== 'interdomestik/interdomestik'
  )
    fail('fixed policy');
  const sourceBefore = candidateSnapshot(candidateRoot, gitDir, frozenContext, policy);
  const projection = legacy
    ? materializeFixedLegacyBank(producerRoot, outputRoot, parentBefore.records)
    : undefined;
  const executionRoot = projection ? path.join(projection.root, PREFIX) : root;
  const oracle = legacy
    ? validateLegacyCapsule(executionRoot, policy)
    : validateCapsule(root, policy);
  // A preparation artifact is not native qualification. No exclusion is emitted on this path.
  if (policy.qualification !== 'QUALIFIED_LINUX_ARM64_COVERAGE')
    fail('coverage successor has not been qualified on Linux');
  const output = path.join(fs.realpathSync(outputRoot), 'p2-' + randomUUID());
  const receipt = await runBackend(executionRoot, output);
  if (projection) assertFixedLegacyBankCurrent(projection);
  const raw = fs.readFileSync(path.join(output, 'observations.json'));
  if (
    receipt.version !== 1 ||
    receipt.architecture !== 'linux/arm64' ||
    receipt.sourceBookendUnchanged !== true ||
    receipt.ownedCleanupConfirmed !== true ||
    receipt.observationSha256 !== digest(raw) ||
    receipt.observedBytes > 65536 ||
    receipt.retainedBytes > 65536
  )
    fail('runtime custody');
  const observation = (legacy ? validateLegacyP2Observation : validateP2Observation)(
    raw,
    oracle,
    fs.readFileSync(path.join(executionRoot, 'capsule/dist/wrapper.mjs'))
  );
  authenticateRuntimeContext(gitDir, frozenContext);
  if (
    parentBefore.sha256 !== sourceSnapshot(producerRoot, gitDir, frozenContext).sha256 ||
    sourceBefore !== candidateSnapshot(candidateRoot, gitDir, frozenContext, policy)
  )
    fail('source bookend');
  const handle = Object.freeze({
    kind: 'fresh-p2-execution',
    bank: legacy ? 'original-factory-nine' : 'qualification-ten',
    ...(projection
      ? {
          inputProjection: Object.freeze({
            root: projection.root,
            sha256: assertFixedLegacyBankCurrent(projection),
            originalProducerRoot: producerRoot,
          }),
        }
      : {}),
    sourceBefore,
    parentBefore: parentBefore.sha256,
    nativeAdmission: false,
    wholeGuardPass: false,
  });
  fresh.set(handle, {
    root: executionRoot,
    projection,
    legacy,
    observation,
    oracle,
    receipt,
    context: frozenContext,
    candidateRoot,
    producerRoot,
    gitDir,
    sourceBefore,
    parentBefore,
    policy,
    consumed: false,
  });
  return handle;
}
// Import is protected; neither a matching JSON object nor a cache result can create this authority.
export async function withFreshP2Dispatch(
  handle,
  { context, discoveredSources },
  dispatchAndMerge
) {
  const state = fresh.get(handle);
  if (!state || state.consumed || JSON.stringify(context) !== JSON.stringify(state.context))
    fail('fresh same-event parent handle required');
  state.consumed = true;
  const globalPartition = partitionOrdinarySources(discoveredSources);
  const partition = state.legacy
    ? legacyBankPartition(globalPartition)
    : Object.freeze({
        capsule: Object.freeze([P2_SOURCE]),
        siblingCapsules: Object.freeze([LEGACY_P2_SOURCE]),
        globalCapsule: globalPartition.capsule,
        ambient: globalPartition.ambient,
      });
  const value = await dispatchAndMerge(
    Object.freeze({
      partition,
      observation: state.observation,
      oracle: state.oracle,
      capsuleRoot: path.join(state.root, 'capsule', 'dist'),
      imageId: state.receipt.imageId,
    })
  );
  if (state.projection) assertFixedLegacyBankCurrent(state.projection);
  authenticateRuntimeContext(state.gitDir, state.context);
  if (
    state.sourceBefore !==
      candidateSnapshot(state.candidateRoot, state.gitDir, state.context, state.policy) ||
    state.parentBefore.sha256 !==
      sourceSnapshot(state.producerRoot, state.gitDir, state.context).sha256
  )
    fail('dispatch bookend');
  return value;
}

// Read-only custody assertion for already-executed private handles. It mints nothing.
export function assertP2InputProjectionCurrent(handle, context) {
  const state = fresh.get(handle);
  if (!state || JSON.stringify(context) !== JSON.stringify(state.context))
    fail('owned same-event input projection');
  if (state.projection) assertFixedLegacyBankCurrent(state.projection);
}
