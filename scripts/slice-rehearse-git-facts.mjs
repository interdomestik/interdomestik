import { execFileSync, spawnSync } from 'node:child_process';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { canonicalJson, sha256 } from './slice-rehearse-core.mjs';
import { CAPACITY_CATEGORIES } from './repo-size-capacity-schema.mjs';
import { collectTrackedStats, getTrackedFiles } from './repo-size-inventory.mjs';
import { capacityOwnerDeltasFromFacts } from './slice-rehearse-capacity-owner-facts.mjs';
import { normalizeGitHubOrigin } from './slice-rehearse-repository-facts.mjs';

const GIT_BIN = '/usr/bin/git';
const SAFE_EXEC_ENV = Object.freeze({
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'core.fsmonitor',
  GIT_CONFIG_VALUE_0: 'false',
  GIT_LITERAL_PATHSPECS: '1',
});
const MAX_WRITER_BYTES = 16 * 1024 * 1024;
const GIT_READ_PREFIX = Object.freeze(['-c', 'core.fsmonitor=false']);
const OPTIONS = Object.freeze({
  encoding: 'utf8',
  env: SAFE_EXEC_ENV,
  timeout: 15_000,
  maxBuffer: 16 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
});

export function gitText(repository, args) {
  return execFileSync(GIT_BIN, [...GIT_READ_PREFIX, '-C', repository, ...args], OPTIONS).trim();
}

export function gitBytes(repository, args) {
  return execFileSync(GIT_BIN, [...GIT_READ_PREFIX, '-C', repository, ...args], OPTIONS);
}

function gitResult(repository, args) {
  return spawnSync(GIT_BIN, [...GIT_READ_PREFIX, '-C', repository, ...args], OPTIONS);
}

function dirtyPaths(repository) {
  const output = execFileSync(
    GIT_BIN,
    [
      ...GIT_READ_PREFIX,
      '-C',
      repository,
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
    ],
    { ...OPTIONS, encoding: 'buffer' }
  );
  const records = output.toString('utf8').split('\0').filter(Boolean);
  const paths = [];
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    const status = record.slice(0, 2);
    paths.push(record.slice(3));
    if (/[RC]/u.test(status)) paths.push(records[++index]);
  }
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right));
}

function isAncestor(repository, baseSha, headSha) {
  const result = gitResult(repository, ['merge-base', '--is-ancestor', baseSha, headSha]);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(result.stderr.trim() || 'Unable to verify base ancestry.');
}

function currentBranch(repository) {
  const result = gitResult(repository, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (result.status === 0) return result.stdout.trim();
  if (result.status === 1) return 'HEAD';
  throw new Error(result.stderr.trim() || 'Unable to read the current branch.');
}

function protectedMain(repository, protectedMainSha) {
  if (!/^[0-9a-f]{40}$/u.test(protectedMainSha ?? '')) {
    throw new Error('Verified protected-main authority evidence is unavailable.');
  }
  assertCommit(repository, protectedMainSha, 'Protected-main anchor');
  return protectedMainSha;
}

function changedPaths(repository, range) {
  const output = gitBytes(repository, [
    'diff',
    '--name-status',
    '-z',
    '--find-renames',
    range,
    '--',
  ]);
  const records = output.toString('utf8').split('\0').filter(Boolean);
  const paths = [];
  for (let index = 0; index < records.length;) {
    const status = records[index++];
    if (!/^(?:[ACDMRTUXB]|R\d{1,3}|C\d{1,3})$/u.test(status)) {
      throw new Error(`Committed changed-path evidence is malformed: ${status}`);
    }
    const pathCount = /^[RC]/u.test(status) ? 2 : 1;
    if (index + pathCount > records.length) {
      throw new Error('Committed changed-path evidence is truncated.');
    }
    paths.push(...records.slice(index, index + pathCount));
    index += pathCount;
  }
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right));
}

function trackedFacts(repository) {
  const trackedFiles = getTrackedFiles(
    repository,
    { includeUntracked: false },
    { gitBin: GIT_BIN, env: SAFE_EXEC_ENV }
  );
  for (const filePath of trackedFiles) {
    const facts = lstatSync(path.join(repository, filePath), { throwIfNoEntry: false });
    if (!facts?.isFile()) throw new Error(`Tracked path is not a regular file: ${filePath}`);
  }
  const stats = collectTrackedStats(repository, trackedFiles, { minLines: 0, top: 0 });
  if (stats.missingFiles.length > 0) {
    throw new Error(`Tracked repository evidence is unavailable: ${stats.missingFiles.join(', ')}`);
  }
  const categoryBytes = Object.fromEntries(CAPACITY_CATEGORIES.map(category => [category, 0]));
  for (const category of stats.categories) categoryBytes[category.name] = category.bytes;
  return { files: stats.total.files, bytes: stats.total.bytes, categoryBytes };
}

function readWriter(repository, filePath) {
  if (filePath.startsWith(':')) throw new Error(`Writer path uses Git pathspec magic: ${filePath}`);
  const absolute = path.resolve(repository, filePath);
  if (!absolute.startsWith(`${repository}${path.sep}`)) throw new Error('Unsafe writer path.');
  let descriptor;
  try {
    descriptor = openSync(
      absolute,
      constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0)
    );
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile()) throw new Error(`Writer path is not a regular file: ${filePath}`);
    if (before.size > BigInt(MAX_WRITER_BYTES))
      throw new Error(`Writer path exceeds read bound: ${filePath}`);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      BigInt(bytes.byteLength) !== before.size ||
      after.size !== before.size ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs
    ) {
      throw new Error(`Writer path changed while collecting facts: ${filePath}`);
    }
    if (bytes.includes(0)) throw new Error(`Writer path is not text: ${filePath}`);
    const text = bytes.toString('utf8');
    return {
      bytes: bytes.byteLength,
      exists: true,
      lines: text.length === 0 ? 0 : text.split('\n').length - Number(text.endsWith('\n')),
      sha256: sha256(bytes),
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { bytes: 0, exists: false, lines: 0, sha256: null };
    if (error?.code === 'ELOOP') throw new Error(`Writer path is not a regular file: ${filePath}`);
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function assertCommit(repository, baseSha, label = 'Manifest base') {
  const result = gitResult(repository, ['cat-file', '-e', `${baseSha}^{commit}`]);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `${label} commit is unavailable: ${baseSha}`);
  }
}

function writerFactsAtBase(repository, baseSha, writerPaths) {
  assertCommit(repository, baseSha);
  return Object.fromEntries(
    writerPaths.map(filePath => {
      const current = readWriter(repository, filePath);
      const baseEntry = gitBytes(repository, [
        'ls-tree',
        '-z',
        '--full-tree',
        baseSha,
        '--',
        filePath,
      ]);
      const baseExists = Buffer.byteLength(baseEntry) > 0;
      if (baseExists && !baseEntry.startsWith('100')) {
        throw new Error(`Manifest-base writer path is not a regular file: ${filePath}`);
      }
      const baseBytes = baseExists
        ? Buffer.byteLength(gitBytes(repository, ['show', `${baseSha}:${filePath}`]))
        : 0;
      return [
        filePath,
        {
          baseBytes,
          baseExists,
          currentBytes: current.bytes,
          currentExists: current.exists,
          currentLines: current.lines,
          currentSha256: current.sha256,
        },
      ];
    })
  );
}

function capacityOwnerDeltasAtBase(repository, baseSha, ownerPaths) {
  return capacityOwnerDeltasFromFacts(writerFactsAtBase(repository, baseSha, ownerPaths));
}

export function collectRepositoryFacts({
  cwd,
  baseSha,
  budgetBaselineSha = baseSha,
  capacityOwnerPaths = [],
  protectedMainSha,
  writerPaths = [],
}) {
  const root = gitText(cwd, ['rev-parse', '--show-toplevel']);
  const headSha = gitText(root, ['rev-parse', 'HEAD']);
  const verifiedProtectedMainSha = protectedMain(root, protectedMainSha);
  const identity = normalizeGitHubOrigin(gitText(root, ['config', '--get', 'remote.origin.url']));
  const mergeBaseSha = gitText(root, ['merge-base', verifiedProtectedMainSha, headSha]);
  const dirty = dirtyPaths(root);
  const manifestFacts = writerFactsAtBase(root, baseSha, writerPaths);
  const writerFacts = Object.fromEntries(
    Object.entries(manifestFacts).map(([filePath, facts]) => [
      filePath,
      {
        currentBytes: facts.currentBytes,
        currentExists: facts.currentExists,
        currentSha256: facts.currentSha256,
        manifestBaseBytes: facts.baseBytes,
        manifestBaseExists: facts.baseExists,
      },
    ])
  );
  const capacityFacts =
    budgetBaselineSha === baseSha
      ? manifestFacts
      : writerFactsAtBase(root, budgetBaselineSha, writerPaths);
  const writerDeltas = Object.fromEntries(
    Object.entries(capacityFacts).map(([filePath, facts]) => [
      filePath,
      {
        bytes: Math.max(0, facts.currentBytes - facts.baseBytes),
        currentBytes: facts.currentBytes,
        currentSha256: facts.currentSha256,
        files: Number(facts.currentExists && !facts.baseExists),
        capacityBaselineExists: facts.baseExists,
        manifestBaseExists: manifestFacts[filePath].baseExists,
        currentExists: facts.currentExists,
      },
    ])
  );
  return {
    root,
    origin: identity.origin,
    providerRepository: identity.providerRepository,
    headSha,
    treeSha: gitText(root, ['rev-parse', 'HEAD^{tree}']),
    baseSha,
    baseIsAncestor: isAncestor(root, baseSha, headSha),
    capacityBaseSha: budgetBaselineSha,
    protectedMainSha: verifiedProtectedMainSha,
    mergeBaseSha,
    branch: currentBranch(root),
    committedChangedPaths: changedPaths(root, `${verifiedProtectedMainSha}...${headSha}`),
    protectedMainAdvancedPaths: changedPaths(root, `${mergeBaseSha}..${verifiedProtectedMainSha}`),
    dirtyPaths: dirty,
    dirtyWriterPaths: dirty.filter(filePath => writerPaths.includes(filePath)),
    capacityOwnerDeltas: capacityOwnerDeltasAtBase(root, budgetBaselineSha, capacityOwnerPaths),
    tracked: trackedFacts(root),
    writerLineCounts: Object.fromEntries(
      Object.entries(manifestFacts).map(([filePath, facts]) => [filePath, facts.currentLines])
    ),
    writerFacts,
    writerFactsDigest: sha256(canonicalJson(writerFacts)),
    writerDeltas,
  };
}
