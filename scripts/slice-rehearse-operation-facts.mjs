import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { attachPullFiles, github, git } from './lean-current-authority-git.mjs';
import {
  ORIGIN,
  PROGRAM,
  TRACKER,
  parseAuthorityDocuments,
} from './lean-current-authority-policy.mjs';
import { resolveRepositoryAuthority } from './lean-current-authority-evidence.mjs';
import {
  canonicalJson,
  compareText,
  exactKeys,
  must,
  normalizeArtifactPath,
  readBoundedRegularText,
  safeRelativePath,
  sha256,
  sortedUnique,
} from './slice-rehearse-canonical.mjs';
import { inspectOptionalRef } from './slice-rehearse-git-facts.mjs';
import {
  authenticateResolverOutput,
  resolveAtAuthorityBoundary,
} from './slice-rehearse-authority-boundary.mjs';
import {
  expectedOperationFacts,
  normalizeOperationFacts,
} from './slice-rehearse-operation-facts-schema.mjs';
import { normalizeRoutineOperations } from './slice-rehearse-operation-schema.mjs';

const SAFE_GIT_ENV = Object.freeze({
  GIT_OPTIONAL_LOCKS: '0',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'core.fsmonitor',
  GIT_CONFIG_VALUE_0: 'false',
});
export { normalizeOperationFacts } from './slice-rehearse-operation-facts-schema.mjs';

const absent = () => ({ exists: false, ownerTaskId: null, safeToDiscard: false });

function inspectArtifact(repo, path, taskId) {
  if (path.startsWith('refs/heads/')) {
    const state = inspectOptionalRef(repo, path);
    return { exists: state !== 'absent', ownerTaskId: null, safeToDiscard: false };
  }
  if (!path.startsWith('/')) return absent();
  try {
    const registryPath = git(
      repo,
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      `interdomestik-harness/cleanup/${taskId}.json`
    );
    const registry = JSON.parse(
      readBoundedRegularText(registryPath, {
        label: 'Cleanup ownership registry',
        maxBytes: 256 * 1024,
        allowedRoots: [dirname(registryPath)],
      })
    );
    exactKeys(registry, ['artifacts', 'schemaVersion', 'taskId'], 'cleanup registry');
    must(
      registry.schemaVersion === 1 &&
        registry.taskId === taskId &&
        Array.isArray(registry.artifacts),
      'invalid cleanup registry'
    );
    const normalizedPath = normalizeArtifactPath(path);
    const entry = registry.artifacts.find(item => item?.path === normalizedPath);
    if (!entry || entry.ownerTaskId !== taskId || entry.safeToDiscard !== true) return absent();
    const value = lstatSync(path, { bigint: true, throwIfNoEntry: false });
    let type = null;
    if (value?.isDirectory()) type = 'directory';
    else if (value?.isFile()) type = 'file';
    const exact = Boolean(
      value &&
      !value.isSymbolicLink() &&
      type === entry.type &&
      realpathSync(path) === entry.realPath &&
      String(value.dev) === entry.device &&
      String(value.ino) === entry.inode
    );
    return {
      exists: exact,
      ownerTaskId: exact ? taskId : null,
      safeToDiscard: exact,
    };
  } catch {
    return absent();
  }
}

function readAuthorityFacts(repo) {
  const live = resolveAtAuthorityBoundary({
    boundary: 'pre_cleanup',
    readLiveAuthority: () => authenticateResolverOutput(resolveRepositoryAuthority(repo, true)),
  }).authority;
  const writerPaths = parseAuthorityDocuments(
    readFileSync(resolve(repo, PROGRAM), 'utf8'),
    readFileSync(resolve(repo, TRACKER), 'utf8')
  ).activeSlice?.productWriterPaths;
  return {
    ...live,
    writerMapDigest: Array.isArray(writerPaths)
      ? sha256(canonicalJson([...writerPaths].sort(compareText)))
      : null,
  };
}

function withSafeGitEnvironment(read, repo) {
  const prior = Object.fromEntries(Object.keys(SAFE_GIT_ENV).map(key => [key, process.env[key]]));
  Object.assign(process.env, SAFE_GIT_ENV);
  try {
    return read(repo);
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function pullFacts(pull, role, number, ancestor, read, repo) {
  const candidate = !number;
  must(
    pull.head?.repo?.full_name === ORIGIN &&
      Array.isArray(pull.labels) &&
      (candidate || pull.labels.length < 100) &&
      (candidate || String(pull.number) === number),
    'invalid PR'
  );
  const fullGateLabelPresent = pull.labels.some(label => label?.name === 'full-gate');
  const facts = {
    ...(candidate ? { number: pull.number } : {}),
    origin: `https://github.com/${ORIGIN}`,
    baseBranch: pull.base.ref,
    branch: pull.head.ref,
    headSha: pull.head.sha,
    state: String(pull.state).toUpperCase(),
    fullGateLabelPresent,
    fullGateEligible: pull.state === 'open' && !fullGateLabelPresent,
  };
  if (role) {
    const inventory = attachPullFiles(
      repo,
      { changedFileCount: pull.changed_files, number: pull.number },
      read
    );
    const changedPaths = sortedUnique(inventory.changedPaths, 'GitHub PR path', safeRelativePath);
    must(inventory.inventoryComplete && changedPaths.length <= 100, 'PR files incomplete');
    Object.assign(facts, {
      role: role.role,
      baseSha: pull.base.sha,
      baseIsAncestor: ancestor(pull.base.sha, pull.head.sha, repo),
      changedPaths,
      changedPathDigest: sha256(JSON.stringify(changedPaths)),
    });
  }
  return facts;
}

export function collectOperationFacts({
  repository,
  operations,
  readGithub = (endpoint, repo) => github(endpoint, repo),
  readAuthority = readAuthorityFacts,
  readArtifact = inspectArtifact,
  readAncestor = (baseSha, headSha, repo) => {
    try {
      git(repo, 'merge-base', '--is-ancestor', baseSha, headSha);
      return true;
    } catch {
      return false;
    }
  },
}) {
  const normalizedOperations = normalizeRoutineOperations(operations);
  const expected = expectedOperationFacts(normalizedOperations);
  if (
    !expected.branches.length &&
    !expected.prs.length &&
    !expected.deferredBranches.length &&
    !expected.cleanup
  )
    return null;
  try {
    const pullRequests = Object.fromEntries(
      expected.prs.map(number => [
        number,
        pullFacts(
          readGithub(`repos/${ORIGIN}/pulls/${number}`, repository),
          expected.roleByPr[number],
          number,
          readAncestor,
          readGithub,
          repository
        ),
      ])
    );
    const remoteHeads = Object.fromEntries(
      expected.branches.map(branch => {
        const encoded = branch.split('/').map(encodeURIComponent).join('/');
        const value = readGithub(`repos/${ORIGIN}/git/ref/heads/${encoded}`, repository);
        return [branch, value?.object?.sha];
      })
    );
    const pullRequestCandidates = Object.fromEntries(
      expected.deferredBranches.map(branch => {
        const contract = normalizedOperations.find(
          item => item?.operation === 'apply_full_gate_label' && item.target.branch === branch
        );
        const endpoint = `repos/${ORIGIN}/pulls?state=open&base=${encodeURIComponent(contract.target.baseBranch)}&head=interdomestik:${encodeURIComponent(branch)}&per_page=2`;
        const pulls = readGithub(endpoint, repository);
        must(Array.isArray(pulls) && pulls.length <= 2, 'GitHub PR candidates are invalid');
        return [branch, pulls.map(pull => pullFacts(pull))];
      })
    );
    let authority = null;
    let taskOwnedArtifacts = {};
    if (expected.needsAuthority) {
      const live = withSafeGitEnvironment(readAuthority, repository);
      authority = {
        activeSlice: live.activeSlice,
        approvedHeadSha: live.approvedHeadSha ?? null,
        runtimeAuthorized: live.runtimeAuthorized,
        writerMapDigest: live.writerMapDigest ?? null,
      };
      if (expected.cleanup) {
        taskOwnedArtifacts = Object.fromEntries(
          expected.cleanup.target.artifactPaths.map(path => [
            path,
            readArtifact(repository, path, expected.cleanup.target.taskId),
          ])
        );
      }
    }
    return normalizeOperationFacts(
      { authority, pullRequestCandidates, pullRequests, remoteHeads, taskOwnedArtifacts },
      normalizedOperations
    );
  } catch {
    return null;
  }
}
