import { execFileSync, spawnSync } from 'node:child_process';
import { canonicalJson, sha256 } from './slice-rehearse-core.mjs';
import {
  capacityOwnerDeltasFromFacts,
  collectTrackedFacts,
  collectWriterFactsAtBase,
} from './slice-rehearse-capacity-owner-facts.mjs';
import {
  gitAncestry,
  gitCurrentBranch,
  normalizeGitHubOrigin,
} from './slice-rehearse-repository-facts.mjs';

const GIT_BIN = '/usr/bin/git';
const SAFE_EXEC_ENV = Object.freeze({
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'core.fsmonitor',
  GIT_CONFIG_VALUE_0: 'false',
  GIT_LITERAL_PATHSPECS: '1',
});
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

function assertCommit(repository, baseSha, label = 'Manifest base') {
  const result = gitResult(repository, ['cat-file', '-e', `${baseSha}^{commit}`]);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `${label} commit is unavailable: ${baseSha}`);
  }
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
  const manifestFacts = collectWriterFactsAtBase({
    repository: root,
    baseSha,
    writerPaths,
    gitBytes,
    assertCommit,
  });
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
      : collectWriterFactsAtBase({
          repository: root,
          baseSha: budgetBaselineSha,
          writerPaths,
          gitBytes,
          assertCommit,
        });
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
    baseIsAncestor: gitAncestry(gitResult, root, baseSha, headSha),
    capacityBaseSha: budgetBaselineSha,
    protectedMainSha: verifiedProtectedMainSha,
    mergeBaseSha,
    branch: gitCurrentBranch(gitResult, root),
    committedChangedPaths: changedPaths(root, `${verifiedProtectedMainSha}...${headSha}`),
    protectedMainAdvancedPaths: changedPaths(root, `${mergeBaseSha}..${verifiedProtectedMainSha}`),
    dirtyPaths: dirty,
    dirtyWriterPaths: dirty.filter(filePath => writerPaths.includes(filePath)),
    capacityOwnerDeltas: capacityOwnerDeltasFromFacts(
      collectWriterFactsAtBase({
        repository: root,
        baseSha: budgetBaselineSha,
        writerPaths: capacityOwnerPaths,
        gitBytes,
        assertCommit,
      })
    ),
    tracked: collectTrackedFacts(root, { gitBin: GIT_BIN, env: SAFE_EXEC_ENV }),
    writerLineCounts: Object.fromEntries(
      Object.entries(manifestFacts).map(([filePath, facts]) => [filePath, facts.currentLines])
    ),
    writerFacts,
    writerFactsDigest: sha256(canonicalJson(writerFacts)),
    writerDeltas,
  };
}
