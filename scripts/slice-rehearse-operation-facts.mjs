import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { github, git } from './lean-current-authority-git.mjs';
import {
  ORIGIN,
  PROGRAM,
  TRACKER,
  parseAuthorityDocuments,
} from './lean-current-authority-policy.mjs';
import { resolveRepositoryAuthority } from './lean-current-authority-evidence.mjs';
import { canonicalJson, sha256 } from './slice-rehearse-canonical.mjs';
import {
  expectedOperationFacts,
  normalizeOperationFacts,
} from './slice-rehearse-operation-facts-schema.mjs';
import { normalizeRoutineOperations } from './slice-rehearse-operation-schema.mjs';

const CANONICAL_ORIGIN = `https://github.com/${ORIGIN}`;
export { normalizeOperationFacts } from './slice-rehearse-operation-facts-schema.mjs';

function must(condition, message) {
  if (!condition) throw new Error(message);
}

function inspectArtifact(repository, path) {
  let exists = false;
  if (path.startsWith('refs/heads/')) {
    try {
      git(repository, 'show-ref', '--verify', path);
      exists = true;
    } catch {
      exists = false;
    }
  } else if (path.startsWith('/')) {
    const value = lstatSync(path, { throwIfNoEntry: false });
    exists = Boolean(value && !value.isSymbolicLink() && (value.isDirectory() || value.isFile()));
  }
  return { exists, ownerTaskId: null, safeToDiscard: false };
}

function readAuthorityFacts(repository) {
  const live = resolveRepositoryAuthority(repository, true);
  const projection = parseAuthorityDocuments(
    readFileSync(resolve(repository, PROGRAM), 'utf8'),
    readFileSync(resolve(repository, TRACKER), 'utf8')
  );
  const writerPaths = projection.activeSlice?.productWriterPaths;
  return {
    ...live,
    writerMapDigest: Array.isArray(writerPaths)
      ? sha256(canonicalJson([...writerPaths].sort()))
      : null,
  };
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
      const live = readAuthority(repository);
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
