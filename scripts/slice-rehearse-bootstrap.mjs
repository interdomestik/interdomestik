import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';

export const GIT_BIN = '/usr/bin/git';
export const SAFE_EXEC_ENV = Object.freeze({
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'core.fsmonitor',
  GIT_CONFIG_VALUE_0: 'false',
  GIT_LITERAL_PATHSPECS: '1',
  GIT_NO_REPLACE_OBJECTS: '1',
});
export const GIT_READ_PREFIX = Object.freeze(['-c', 'core.fsmonitor=false']);
export const GIT_OPTIONS = Object.freeze({
  env: SAFE_EXEC_ENV,
  timeout: 15_000,
  maxBuffer: 16 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
});

export function gitBytes(repository, args) {
  return execFileSync(GIT_BIN, [...GIT_READ_PREFIX, '-C', repository, ...args], GIT_OPTIONS);
}

export function gitText(repository, args) {
  return gitBytes(repository, args).toString('utf8').trim();
}

export function readLocalAnchor(cwd) {
  const root = realpathSync(gitText(cwd, ['rev-parse', '--show-toplevel']));
  return {
    root,
    gitDir: realpathSync(gitText(root, ['rev-parse', '--absolute-git-dir'])),
    commonDir: realpathSync(
      gitText(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
    ),
    headSha: gitText(root, ['rev-parse', 'HEAD']),
    treeSha: gitText(root, ['rev-parse', 'HEAD^{tree}']),
    branch: gitText(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    origin: gitText(root, ['config', '--get', 'remote.origin.url']),
  };
}

function sameAnchor(actual, expected) {
  return expected && Object.keys(actual).every(key => actual[key] === expected[key]);
}

export function assertLocalAnchor(cwd, expected) {
  if (!sameAnchor(readLocalAnchor(cwd), expected))
    throw new Error('Local rehearsal anchor changed.');
}

// Transient bounded file observation, not a snapshot or an execution-time CAS.
export function observeLocalFile(root, file) {
  if (
    typeof file !== 'string' ||
    !file ||
    file.includes('\0') ||
    file.includes('\\') ||
    file.split('/').some(part => !part || part === '.' || part === '..') ||
    Buffer.from(file).toString('utf8') !== file
  ) {
    throw new Error('Local observation unsupported path encoding or shape.');
  }
  const absolute = resolve(root, file);
  let parent = root;
  for (const part of file.split('/').slice(0, -1)) {
    parent = resolve(parent, part);
    const stat = lstatSync(parent, { throwIfNoEntry: false });
    if (stat && !stat.isDirectory()) throw new Error('Local observation unsupported parent path.');
  }
  const initial = lstatSync(absolute, { throwIfNoEntry: false });
  if (!initial) return null;
  if (!initial.isFile()) throw new Error('Local observation unsupported: not a regular file.');
  let fd;
  try {
    if (realpathSync(absolute) !== absolute)
      throw new Error('Local observation unsupported symlink.');
    fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile()) throw new Error('Local observation unsupported: not a regular file.');
    if (before.size > 16n * 1024n * 1024n)
      throw new Error('Local observation unsupported read bound.');
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let size = 0,
      count;
    while (size < bytes.length && (count = readSync(fd, bytes, size, bytes.length - size, null)))
      size += count;
    const after = fstatSync(fd, { bigint: true });
    const named = lstatSync(absolute, { bigint: true });
    if (
      size !== Number(before.size) ||
      realpathSync(absolute) !== absolute ||
      ['dev', 'ino', 'size', 'mode', 'mtimeNs', 'ctimeNs'].some(
        key => before[key] !== after[key] || before[key] !== named[key]
      )
    ) {
      throw new Error('Local observation changed while reading file.');
    }
    return [
      String(before.dev),
      String(before.ino),
      Number(before.mode & 0o111n),
      size,
      createHash('sha256').update(bytes.subarray(0, size)).digest('hex'),
    ];
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function openPolicyFile(root, record) {
  const entry = /^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/u.exec(record);
  if (!entry) throw new Error('Bootstrap policy requires regular tracked files only.');
  const [, mode, objectId, file] = entry;
  const absolute = resolve(root, file);
  if (!absolute.startsWith(`${root}${sep}`) || realpathSync(absolute) !== absolute)
    throw new Error(`Bootstrap policy path is not regular or canonical: ${file}`);
  const descriptor = openSync(
    absolute,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  );
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size > 16n * 1024n * 1024n)
      throw new Error(`Bootstrap policy path is not a bounded regular file: ${file}`);
    return { descriptor, before, absolute, objectId, mode, file };
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function hashPolicyFiles(root, files) {
  // Git hashes the exact open inodes with its native object-ID implementation.
  // No filters, object-store payload trust, writes, or candidate path reopens.
  const hashes = execFileSync(
    GIT_BIN,
    [
      ...GIT_READ_PREFIX,
      '-c',
      'core.bigFileThreshold=16m',
      '-C',
      root,
      'hash-object',
      '--no-filters',
      '--stdin-paths',
    ],
    {
      ...GIT_OPTIONS,
      input: files.map((_, index) => `/dev/fd/${index + 3}\n`).join(''),
      stdio: ['pipe', 'pipe', 'pipe', ...files.map(file => file.descriptor)],
    }
  )
    .toString('utf8')
    .split('\n');
  if (hashes.pop() !== '' || hashes.length !== files.length)
    throw new Error('Bootstrap policy hash response is invalid.');
  return hashes;
}

function assertPolicyFileIdentity(file, hash) {
  const { before, absolute, descriptor } = file;
  const after = fstatSync(descriptor, { bigint: true });
  const named = lstatSync(absolute, { bigint: true });
  if (
    hash !== file.objectId ||
    realpathSync(absolute) !== absolute ||
    (before.mode & 0o111n ? '100755' : '100644') !== file.mode ||
    ['dev', 'ino', 'size', 'mode', 'mtimeNs', 'ctimeNs'].some(
      key => before[key] !== after[key] || before[key] !== named[key]
    )
  )
    throw new Error(`Bootstrap policy file changed: ${file.file}`);
}

function assertPolicyFiles(root, records) {
  let totalBytes = 0n;
  for (let offset = 0; offset < records.length; offset += 32) {
    const files = [];
    try {
      for (const record of records.slice(offset, offset + 32)) {
        const file = openPolicyFile(root, record);
        files.push(file);
        totalBytes += file.before.size;
        if (totalBytes > 128n * 1024n * 1024n)
          throw new Error('Bootstrap policy tree exceeds its byte bound.');
      }
      const hashes = hashPolicyFiles(root, files);
      for (const [index, file] of files.entries()) assertPolicyFileIdentity(file, hashes[index]);
    } finally {
      for (const file of files) closeSync(file.descriptor);
    }
  }
}

function assertPristinePolicy(root, commitSha) {
  // Inspect actual bytes, not status alone: hidden index flags can conceal drift.
  const index = gitText(root, ['ls-files', '-v', '-z']);
  if (index.split('\0').some(record => /^(?:[a-z]|S) /u.test(record))) {
    throw new Error('Bootstrap policy has hidden index state.');
  }
  if (gitBytes(root, ['ls-files', '--others', '-z']).length) {
    throw new Error('Bootstrap policy contains untracked files (including ignored dependencies).');
  }
  const records = gitBytes(root, ['ls-tree', '-r', '-z', '--full-tree', commitSha])
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  if (!records.length || records.length > 10_000)
    throw new Error('Bootstrap policy tree exceeds its file bound.');
  assertPolicyFiles(root, records);
  if (
    gitBytes(root, [
      'diff',
      '--cached',
      '--ita-visible-in-index',
      '--name-only',
      '-z',
      commitSha,
      '--',
    ]).length
  ) {
    throw new Error('Bootstrap policy index changed from its pin.');
  }
}

// Local precursor only, not an installed trusted launcher. Its code, approved pin,
// Node runtime and policy checkout require external provenance and immutable-host
// isolation. A caller-supplied SHA or a candidate invoking this module grants no
// authority. No manifest, CLI flag, environment variable or main-ref fallback.
// Byte checking the entire checkout covers its repository-owned executable
// dependencies without trusting a candidate-supplied dependency list. Approval
// must still establish a closed dependency graph and trusted external runtime;
// this comparator is not a JavaScript sandbox or an execution-time CAS.
export function validateRehearsalBootstrap(bootstrap, cwd) {
  const policy = bootstrap?.policy;
  if (!policy || typeof policy.root !== 'string') throw new Error('Bootstrap policy is required.');
  if (!/^[0-9a-f]{40}$/u.test(policy.commitSha ?? ''))
    throw new Error('Bootstrap policy pin must be an immutable commit SHA.');
  const target = readLocalAnchor(cwd);
  if (!sameAnchor(target, bootstrap.target))
    throw new Error('Bootstrap target identity does not match this worktree.');
  if (!isAbsolute(policy.root) || realpathSync(policy.root) !== policy.root) {
    throw new Error('Bootstrap policy root must be canonical.');
  }
  const policyAnchor = readLocalAnchor(policy.root);
  if (policyAnchor.root !== policy.root)
    throw new Error('Bootstrap policy root must be canonical.');
  const rootsOverlap =
    policy.root === target.root ||
    policy.root.startsWith(`${target.root}${sep}`) ||
    target.root.startsWith(`${policy.root}${sep}`);
  if (rootsOverlap || policyAnchor.commonDir === target.commonDir) {
    throw new Error('Bootstrap policy and target must use separate checkouts and Git stores.');
  }
  let pinnedCommit;
  try {
    pinnedCommit = gitText(policy.root, ['rev-parse', '--verify', `${policy.commitSha}^{commit}`]);
  } catch {
    throw new Error('Bootstrap policy pin is unresolved locally.');
  }
  if (pinnedCommit !== policy.commitSha)
    throw new Error('Bootstrap policy pin is not an exact commit.');
  if (policyAnchor.headSha !== pinnedCommit)
    throw new Error('Bootstrap policy checkout does not match its pin.');
  if (policy.treeSha !== undefined && policy.treeSha !== policyAnchor.treeSha)
    throw new Error('Bootstrap policy tree does not match admission.');
  assertPristinePolicy(policy.root, pinnedCommit);
  assertLocalAnchor(policy.root, policyAnchor);
  assertLocalAnchor(target.root, target);
  return Object.freeze({ policyRoot: policy.root, target: Object.freeze(target) });
}
