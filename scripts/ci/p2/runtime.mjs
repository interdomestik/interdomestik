import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  authenticateRuntimeContext,
  safeEnv,
  exact,
} from '../db-access-provider-runtime-identity.mjs';
import { validateP2Observation } from './observations.mjs';
import { P2_SOURCE, partitionOrdinarySources } from './source-fence.mjs';
const PREFIX = 'scripts/ci/p2/';
const WRAPPER = 'apps/web/src/actions/admin-claims/assign.core.ts';
const RELAY = 'apps/web/src/server/operations/m4-assignment-relay.ts';
const fresh = new WeakMap();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => {
  throw Error('required P2 runtime refused: ' + message);
};
function record(bytes, mode = '100644') {
  return { bytes: bytes.length, sha256: digest(bytes), mode };
}
function gitBytes(gitDir, args) {
  return execFileSync('/usr/bin/git', ['--no-replace-objects', '--git-dir', gitDir, ...args], {
    env: safeEnv,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 30000,
  });
}
function sourceSnapshot(producerRoot, gitDir, context) {
  const listed = gitBytes(gitDir, ['ls-tree', '-r', '-z', context.sourceCommit, '--', PREFIX])
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  const records = {};
  for (const line of listed) {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/u.exec(line);
    if (!match || !match[3].startsWith(PREFIX)) fail('producer tree kind');
    const bytes = gitBytes(gitDir, ['cat-file', 'blob', match[2]]);
    records[match[3]] = record(bytes, match[1]);
    exact(producerRoot, match[3], records[match[3]]);
  }
  if (!records[PREFIX + 'runtime.mjs'] || !records[PREFIX + 'policy.json'])
    fail('missing fixed producer');
  const actual = [],
    directories = [];
  const walk = relative => {
    for (const name of fs.readdirSync(path.join(producerRoot, relative))) {
      const file = relative + name;
      const st = fs.lstatSync(path.join(producerRoot, file));
      if (st.isSymbolicLink()) fail('producer symlink');
      if (st.isDirectory()) {
        directories.push(file + '/');
        walk(file + '/');
      } else if (st.isFile()) actual.push(file);
      else fail('producer filesystem kind');
    }
  };
  walk(PREFIX);
  if (JSON.stringify(actual.sort()) !== JSON.stringify(Object.keys(records).sort()))
    fail('producer exact file set');
  const expectedDirectories = new Set();
  for (const file of Object.keys(records)) {
    let directory = path.posix.dirname(file) + '/';
    while (directory !== PREFIX) {
      expectedDirectories.add(directory);
      directory = path.posix.dirname(directory.slice(0, -1)) + '/';
    }
  }
  if (JSON.stringify(directories.sort()) !== JSON.stringify([...expectedDirectories].sort()))
    fail('producer exact directory set');
  return { records, sha256: digest(JSON.stringify(records)) };
}
function candidateSnapshot(candidateRoot, gitDir, context, policy) {
  if (
    JSON.stringify(Object.keys(policy.sourceFiles).sort()) !==
    JSON.stringify([P2_SOURCE, WRAPPER, RELAY].sort())
  )
    fail('widened source policy');
  const result = {};
  for (const file of [P2_SOURCE, WRAPPER, RELAY]) {
    const bytes = gitBytes(gitDir, ['show', context.candidateCommit + ':' + file]);
    if (digest(bytes) !== policy.sourceFiles[file])
      fail('candidate source requires reviewed capsule update');
    exact(candidateRoot, file, record(bytes));
    result[file] = digest(bytes);
  }
  for (const [file, expected] of Object.entries(policy.dispatchFiles)) {
    const bytes = gitBytes(gitDir, ['show', context.candidateCommit + ':' + file]);
    if (digest(bytes) !== expected) fail('ordinary dispatch configuration drift');
    exact(candidateRoot, file, record(bytes));
    result[file] = digest(bytes);
  }
  return digest(JSON.stringify(result));
}
function validateCapsule(root, policy) {
  const oracle = JSON.parse(fs.readFileSync(path.join(root, 'dist/source-manifest.json')));
  if (
    JSON.stringify(oracle.sourceFiles) !== JSON.stringify(policy.sourceFiles) ||
    oracle.tests.length !== 10 ||
    oracle.mockSpecifiers.length !== 2
  )
    fail('closed capsule oracle');
  for (const [file, name] of [
    [P2_SOURCE, 'wrapper.test'],
    [WRAPPER, 'wrapper'],
    [RELAY, 'relay'],
  ]) {
    const original = fs.readFileSync(
      path.join(root, 'capsule', 'dist', name + '.original.ts'),
      'utf8'
    );
    const generated = fs.readFileSync(
      path.join(root, 'capsule', 'dist', name + '.source.ts'),
      'utf8'
    );
    if (digest(original) !== policy.sourceFiles[file]) fail('capsule original bytes');
    for (const segment of oracle.retainedSegments.filter(s => s.file === file)) {
      const actual = original.slice(segment.start, segment.end);
      if (
        digest(actual) !== segment.sha256 ||
        generated.slice(segment.generatedStart, segment.generatedEnd) !== actual
      )
        fail('retained source segment');
    }
  }
  return oracle;
}
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
export async function runRequiredP2Runtime({
  candidateRoot,
  producerRoot,
  gitDir,
  context,
  outputRoot,
}) {
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
    policy.scope !== 'exact-mounted-assign-wrapper-ten' ||
    policy.baseline !== 604 ||
    policy.repository !== 'interdomestik/interdomestik'
  )
    fail('fixed policy');
  const sourceBefore = candidateSnapshot(candidateRoot, gitDir, frozenContext, policy);
  const oracle = validateCapsule(root, policy);
  // A preparation artifact is not native qualification. No exclusion is emitted on this path.
  if (policy.qualification !== 'QUALIFIED_LINUX_ARM64_COVERAGE')
    fail('coverage successor has not been qualified on Linux');
  const output = path.join(fs.realpathSync(outputRoot), 'p2-' + randomUUID());
  const receipt = await runBackend(root, output);
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
  const observation = validateP2Observation(
    raw,
    oracle,
    fs.readFileSync(path.join(root, 'capsule/dist/wrapper.mjs'))
  );
  authenticateRuntimeContext(gitDir, frozenContext);
  if (
    parentBefore.sha256 !== sourceSnapshot(producerRoot, gitDir, frozenContext).sha256 ||
    sourceBefore !== candidateSnapshot(candidateRoot, gitDir, frozenContext, policy)
  )
    fail('source bookend');
  const handle = Object.freeze({
    kind: 'fresh-p2-execution',
    sourceBefore,
    parentBefore: parentBefore.sha256,
    nativeAdmission: false,
    wholeGuardPass: false,
  });
  fresh.set(handle, {
    root,
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
  const partition = partitionOrdinarySources(discoveredSources);
  const value = await dispatchAndMerge(
    Object.freeze({
      partition,
      observation: state.observation,
      oracle: state.oracle,
      capsuleRoot: path.join(state.root, 'capsule', 'dist'),
      imageId: state.receipt.imageId,
    })
  );
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
