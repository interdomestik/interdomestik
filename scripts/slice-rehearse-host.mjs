import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readLocalAnchor, validateRehearsalBootstrap } from './slice-rehearse-bootstrap.mjs';
import { exactKeys, must, readBoundedRegularText, sha256 } from './slice-rehearse-canonical.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHA40 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const FILE_KEYS = ['path', 'sha256'];
const TARGET_KEYS = ['root', 'gitDir', 'commonDir', 'origin'];
const PRELOADS = [
  'slice-rehearse-host.mjs',
  'slice-rehearse-bootstrap.mjs',
  'slice-rehearse-canonical.mjs',
  'slice-rehearse.mjs',
];
const loaded = PRELOADS.map(name => [name, sha256(fs.readFileSync(join(ROOT, 'scripts', name)))]);
let admittedPolicy;
const inside = (root, path) => path === root || path.startsWith(`${root}${sep}`);

function canonical(path, label) {
  must(
    typeof path === 'string' && isAbsolute(path) && fs.realpathSync(path) === path,
    `Host ${label} path is not canonical`
  );
  return path;
}

function secureApprovalRoot(root) {
  canonical(root, 'approval root');
  const stat = fs.lstatSync(root);
  must(
    stat.isDirectory() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o700,
    'Host approval root is unsafe'
  );
}

// Host-provisioned raw receipt pin; no lookup in the candidate, argv or environment.
function readApproval(root, name, digest) {
  secureApprovalRoot(root);
  const pathname = join(root, name);
  const stat = fs.lstatSync(pathname);
  must(
    stat.isFile() && stat.nlink === 1 && stat.uid === process.getuid() && !(stat.mode & 0o022),
    'Host approval receipt is unsafe'
  );
  const text = readBoundedRegularText(pathname, {
    label: 'Host approval receipt',
    maxBytes: 64 * 1024,
    allowedRoots: [root],
  });
  must(sha256(text) === digest, 'Host approval receipt changed or withdrawn');
  const record = JSON.parse(text);
  exactKeys(
    record,
    ['schemaVersion', 'kind', 'expiresAt', 'policy', 'target', 'loader', 'runtime'],
    'host admission'
  );
  must(
    record.schemaVersion === 1 && record.kind === 'slice-rehearse-host',
    'Host admission schema is invalid'
  );
  const expiresAt = Date.parse(record.expiresAt);
  must(
    Number.isFinite(expiresAt) &&
      new Date(expiresAt).toISOString() === record.expiresAt &&
      expiresAt > Date.now(),
    'Host approval is expired or invalid'
  );
  exactKeys(record.policy, ['root', 'commitSha', 'treeSha'], 'host policy');
  must(
    SHA40.test(record.policy.commitSha) && SHA40.test(record.policy.treeSha),
    'Host policy requires exact commit and tree pins'
  );
  exactKeys(record.target, TARGET_KEYS, 'host target');
  must(
    TARGET_KEYS.every(key => typeof record.target[key] === 'string' && record.target[key]),
    'Host target binding is incomplete'
  );
  exactKeys(
    record.runtime,
    ['node', 'git', 'github', 'dependencyFiles', 'nodeVersion', 'platform', 'arch'],
    'host runtime'
  );
  return record;
}

function checkFile(record, forbiddenRoots, allowHardlinks = false) {
  exactKeys(record, FILE_KEYS, 'host runtime file');
  canonical(record.path, 'runtime file');
  must(SHA256.test(record.sha256), 'Host runtime file digest is invalid');
  must(
    !forbiddenRoots.some(root => inside(root, record.path)),
    'Host runtime file is candidate-controlled'
  );
  const fd = fs.openSync(
    record.path,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  );
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    must(
      before.isFile() &&
        (before.nlink === 1n || (allowHardlinks && before.uid === 0n)) &&
        before.size <= 256n * 1024n * 1024n &&
        !(before.mode & 0o022n),
      'Host runtime file is unsafe or oversized'
    );
    const digest = createHash('sha256'),
      chunk = Buffer.alloc(1024 * 1024);
    let size = 0,
      count;
    while ((count = fs.readSync(fd, chunk, 0, chunk.length, null))) {
      size += count;
      must(size <= Number(before.size), 'Host runtime file grew while reading');
      digest.update(chunk.subarray(0, count));
    }
    const after = fs.fstatSync(fd, { bigint: true }),
      named = fs.lstatSync(record.path, { bigint: true });
    must(
      size === Number(before.size) &&
        digest.digest('hex') === record.sha256 &&
        fs.realpathSync(record.path) === record.path &&
        ['dev', 'ino', 'mode', 'size', 'mtimeNs', 'ctimeNs'].every(
          key => before[key] === after[key] && before[key] === named[key]
        ),
      'Host runtime file digest or identity changed'
    );
    return size;
  } finally {
    fs.closeSync(fd);
  }
}

function checkRuntime(record, target) {
  const runtime = record.runtime;
  must(
    process.execArgv.length === 0 &&
      !Object.entries(process.env).some(
        ([key, value]) => value && (/^NODE_(OPTIONS|PATH)$/u.test(key) || /^(LD_|DYLD_)/u.test(key))
      ),
    'Host runtime has unsupported loader settings'
  );
  must(
    runtime.nodeVersion === process.version &&
      runtime.platform === process.platform &&
      runtime.arch === process.arch,
    'Host runtime platform or version differs'
  );
  must(
    runtime.node?.path === fs.realpathSync(process.execPath) &&
      runtime.git?.path === fs.realpathSync('/usr/bin/git'),
    'Host runtime executable selection differs'
  );
  const github = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'].find(pathname =>
    fs.existsSync(pathname)
  );
  must(
    github && runtime.github?.path === fs.realpathSync(github),
    'Host runtime GitHub executable selection differs'
  );
  must(
    record.loader?.path === fs.realpathSync(resolve(process.argv[1] ?? '')),
    'Host loader selection differs'
  );
  must(
    Array.isArray(runtime.dependencyFiles) && runtime.dependencyFiles.length <= 128,
    'Host dependency inventory is unavailable or oversized'
  );
  const files = [
    record.loader,
    runtime.node,
    runtime.git,
    runtime.github,
    ...runtime.dependencyFiles,
  ];
  must(
    new Set(files.map(file => file?.path)).size === files.length,
    'Host dependency inventory has duplicate paths'
  );
  let bytes = 0;
  for (const file of files) {
    bytes += checkFile(file, [target.root, target.gitDir, target.commonDir], file === runtime.git);
    must(bytes <= 512 * 1024 * 1024, 'Host dependency inventory exceeds its byte bound');
  }
  for (const [name, digest] of loaded)
    must(
      sha256(fs.readFileSync(join(ROOT, 'scripts', name))) === digest,
      'Host loaded module bytes changed'
    );
}

// The initial loader/pin, closed dependency inventory and OS isolation are trusted
// deployment inputs. This verifier cannot authenticate its own provisioning or
// sandbox arbitrary JavaScript. It reads existing approvals; it never issues one.
export function createRehearsalHost({
  approvalRoot,
  receiptName,
  receiptSha256,
  stdout,
  stderr,
} = {}) {
  must(
    typeof approvalRoot === 'string' && isAbsolute(approvalRoot),
    'Host approval root is required'
  );
  must(
    typeof receiptName === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.receipt$/u.test(receiptName),
    'Host approval receipt name is invalid'
  );
  must(
    typeof receiptSha256 === 'string' && SHA256.test(receiptSha256),
    'Host approval receipt pin is required'
  );
  return Object.freeze({
    stdout,
    stderr,
    admit(request) {
      exactKeys(request, ['cwd', 'manifestPath'], 'host request');
      must(
        typeof request.cwd === 'string' &&
          isAbsolute(request.cwd) &&
          typeof request.manifestPath === 'string' &&
          request.manifestPath.length > 0,
        'Host request is invalid'
      );
      const record = readApproval(approvalRoot, receiptName, receiptSha256);
      must(record.policy.root === ROOT, 'Host loaded policy root differs from admission');
      for (const key of ['root', 'gitDir', 'commonDir'])
        canonical(record.target[key], `target ${key}`);
      must(fs.realpathSync(request.cwd) === record.target.root, 'Host target root differs');
      must(
        ![record.target.root, record.target.gitDir, record.target.commonDir, ROOT].some(root =>
          inside(root, approvalRoot)
        ),
        'Host approval root overlaps candidate or policy'
      );
      checkRuntime(record, record.target);
      const target = readLocalAnchor(request.cwd);
      must(
        TARGET_KEYS.every(key => target[key] === record.target[key]),
        'Host target identity differs'
      );
      const bootstrap = { policy: record.policy, target };
      const policyAnchor = readLocalAnchor(ROOT);
      must(policyAnchor.origin === target.origin, 'Host policy origin differs');
      const policyRoots = [ROOT, policyAnchor.gitDir, policyAnchor.commonDir];
      const targetRoots = [target.root, target.gitDir, target.commonDir];
      must(
        !policyRoots.some(left =>
          targetRoots.some(right => inside(left, right) || inside(right, left))
        ),
        'Host policy and target storage overlap'
      );
      must(
        ![...policyRoots, ...targetRoots].some(
          root => inside(root, approvalRoot) || inside(approvalRoot, root)
        ),
        'Host approval storage overlaps policy or target'
      );
      validateRehearsalBootstrap(bootstrap, request.cwd);
      checkRuntime(record, target);
      const identity = JSON.stringify(record.policy);
      must(
        !admittedPolicy || admittedPolicy === identity,
        'Host process cannot switch its loaded policy pin'
      );
      readApproval(approvalRoot, receiptName, receiptSha256);
      admittedPolicy = identity;
      return Object.freeze({ policy: Object.freeze(record.policy), target: Object.freeze(target) });
    },
  });
}
