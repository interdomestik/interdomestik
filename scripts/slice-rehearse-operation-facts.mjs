import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { github, git } from './lean-current-authority-git.mjs';
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
  normalizeArtifactPath,
  readBoundedRegularText,
  sha256,
} from './slice-rehearse-canonical.mjs';
import {
  authenticateResolverOutput,
  resolveAtAuthorityBoundary,
} from './slice-rehearse-authority-boundary.mjs';
import {
  expectedOperationFacts,
  normalizeOperationFacts,
} from './slice-rehearse-operation-facts-schema.mjs';
import { normalizeRoutineOperations } from './slice-rehearse-operation-schema.mjs';

const CANONICAL_ORIGIN = `https://github.com/${ORIGIN}`;
const SAFE_GIT_ENV = Object.freeze({
  GIT_OPTIONAL_LOCKS: '0',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'core.fsmonitor',
  GIT_CONFIG_VALUE_0: 'false',
});
export { normalizeOperationFacts } from './slice-rehearse-operation-facts-schema.mjs';

function must(condition, message) {
  if (!condition) throw new Error(message);
}

function inspectArtifact(repository, path, taskId) {
  if (path.startsWith('refs/heads/')) {
    let exists = false;
    try {
      git(repository, 'show-ref', '--verify', path);
      exists = true;
    } catch {
      exists = false;
    }
    return { exists, ownerTaskId: null, safeToDiscard: false };
  }
  if (!path.startsWith('/')) return { exists: false, ownerTaskId: null, safeToDiscard: false };
  try {
    const registryPath = git(
      repository,
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
    exactKeys(registry, ['artifacts', 'schemaVersion', 'taskId'], 'cleanup ownership registry');
    if (
      registry.schemaVersion !== 1 ||
      registry.taskId !== taskId ||
      !Array.isArray(registry.artifacts)
    ) {
      throw new Error('cleanup ownership registry identity differs');
    }
    const normalizedPath = normalizeArtifactPath(path);
    const entry = registry.artifacts.find(item => item?.path === normalizedPath);
    if (!entry || entry.ownerTaskId !== taskId || entry.safeToDiscard !== true) {
      return { exists: false, ownerTaskId: null, safeToDiscard: false };
    }
    const value = lstatSync(path, { bigint: true, throwIfNoEntry: false });
    const type = value?.isDirectory() ? 'directory' : value?.isFile() ? 'file' : null;
    const exact =
      value &&
      !value.isSymbolicLink() &&
      type === entry.type &&
      realpathSync(path) === entry.realPath &&
      String(value.dev) === entry.device &&
      String(value.ino) === entry.inode;
    return {
      exists: Boolean(exact),
      ownerTaskId: exact ? taskId : null,
      safeToDiscard: Boolean(exact),
    };
  } catch {
    return { exists: false, ownerTaskId: null, safeToDiscard: false };
  }
}

function readAuthorityFacts(repository) {
  const live = resolveAtAuthorityBoundary({
    boundary: 'pre_cleanup',
    readLiveAuthority: () =>
      authenticateResolverOutput(resolveRepositoryAuthority(repository, true)),
  }).authority;
  const projection = parseAuthorityDocuments(
    readFileSync(resolve(repository, PROGRAM), 'utf8'),
    readFileSync(resolve(repository, TRACKER), 'utf8')
  );
  const writerPaths = projection.activeSlice?.productWriterPaths;
  return {
    ...live,
    writerMapDigest: Array.isArray(writerPaths)
      ? sha256(canonicalJson([...writerPaths].sort(compareText)))
      : null,
  };
}

function withSafeGitEnvironment(readAuthority, repository) {
  const previous = Object.fromEntries(
    Object.keys(SAFE_GIT_ENV).map(key => [key, process.env[key]])
  );
  Object.assign(process.env, SAFE_GIT_ENV);
  try {
    return readAuthority(repository);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

export function collectOperationFacts({
  repository,
  operations,
  readGithub = (endpoint, repo) => github(endpoint, repo),
  readAuthority = readAuthorityFacts,
  readArtifact = inspectArtifact,
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
      expected.prs.map(number => {
        const pull = readGithub(`repos/${ORIGIN}/pulls/${number}`, repository);
        must(String(pull.number) === number, 'GitHub PR number differs');
        must(pull.head?.repo?.full_name === ORIGIN, 'GitHub PR origin differs');
        must(
          Array.isArray(pull.labels) && pull.labels.length < 100,
          'GitHub label inventory is invalid'
        );
        const fullGateLabelPresent = pull.labels.some(label => label?.name === 'full-gate');
        return [
          number,
          {
            origin: CANONICAL_ORIGIN,
            baseBranch: pull.base.ref,
            branch: pull.head.ref,
            headSha: pull.head.sha,
            state: String(pull.state).toUpperCase(),
            fullGateLabelPresent,
            fullGateEligible: pull.state === 'open' && !fullGateLabelPresent,
          },
        ];
      })
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
        return [
          branch,
          pulls.map(pull => {
            must(pull.head?.repo?.full_name === ORIGIN, 'GitHub PR origin differs');
            must(Array.isArray(pull.labels), 'GitHub PR labels are invalid');
            const fullGateLabelPresent = pull.labels.some(label => label?.name === 'full-gate');
            return {
              number: pull.number,
              origin: CANONICAL_ORIGIN,
              baseBranch: pull.base.ref,
              branch: pull.head.ref,
              headSha: pull.head.sha,
              state: String(pull.state).toUpperCase(),
              fullGateLabelPresent,
              fullGateEligible: pull.state === 'open' && !fullGateLabelPresent,
            };
          }),
        ];
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
