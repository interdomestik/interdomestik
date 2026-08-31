import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { resolveRepositoryAuthority } from './lean-current-authority.mjs';
import {
  authenticateResolverOutput,
  resolveAtAuthorityBoundary,
} from './slice-rehearse-authority-boundary.mjs';
import {
  canonicalJson,
  compareText,
  must,
  normalizeCommitSha,
  normalizeGitHubOrigin,
  readBoundedRegularText,
  sha256,
} from './slice-rehearse-canonical.mjs';
import {
  OPERATION_ARTIFACT_ROOT,
  operationBodyArtifact,
} from './slice-rehearse-operation-certificate.mjs';

const GH_CANDIDATES = ['/usr/bin/gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh'];
const SAFE_EXEC = Object.freeze({
  encoding: 'utf8',
  env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
  maxBuffer: 8 * 1024 * 1024,
  timeout: 5 * 60_000,
});

function resolveGhBinary() {
  const binary = GH_CANDIDATES.find(existsSync);
  must(binary, `GitHub CLI not found in: ${GH_CANDIDATES.join(', ')}`);
  return binary;
}

function lsRemote(ref) {
  const output = execFileSync(
    '/usr/bin/git',
    ['ls-remote', '--refs', 'origin', ref],
    SAFE_EXEC
  ).trim();
  if (!output) return null;
  const [sha, resolvedRef, extra] = output.split(/\s+/u);
  must(!extra && resolvedRef === ref, 'live remote ref response is ambiguous');
  return normalizeCommitSha(sha, 'live remote head SHA');
}

function normalizePull(value) {
  return {
    number: value.number,
    baseBranch: value.baseRefName,
    branch: value.headRefName,
    headSha: value.headRefOid,
    origin: value.headRepository?.nameWithOwner?.toLowerCase(),
  };
}

function readPr(prNumber) {
  return normalizePull(
    JSON.parse(
      execFileSync(
        resolveGhBinary(),
        [
          'pr',
          'view',
          String(prNumber),
          '--json',
          'number,headRefOid,headRefName,baseRefName,headRepository',
        ],
        SAFE_EXEC
      )
    )
  );
}

function readPrForBranch(certificate) {
  const values = JSON.parse(
    execFileSync(
      resolveGhBinary(),
      [
        'pr',
        'list',
        '--state',
        'all',
        '--head',
        certificate.branch,
        '--base',
        certificate.baseBranch,
        '--limit',
        '2',
        '--json',
        'number,headRefOid,headRefName,baseRefName,headRepository',
      ],
      SAFE_EXEC
    )
  );
  must(Array.isArray(values) && values.length <= 1, 'live PR lookup is ambiguous');
  return values.length ? normalizePull(values[0]) : null;
}

export function readLiveOperationFacts(_request, certificate) {
  const changedPaths = execFileSync(
    '/usr/bin/git',
    ['diff', '--name-only', '-z', `${certificate.baseSha}...${certificate.headSha}`],
    SAFE_EXEC
  )
    .split('\0')
    .filter(Boolean)
    .sort(compareText);
  return {
    origin: normalizeGitHubOrigin(
      execFileSync('/usr/bin/git', ['config', '--get', 'remote.origin.url'], SAFE_EXEC).trim()
    ).origin,
    baseSha: lsRemote(`refs/heads/${certificate.baseBranch}`),
    headSha: execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], SAFE_EXEC).trim(),
    treeSha: execFileSync('/usr/bin/git', ['rev-parse', 'HEAD^{tree}'], SAFE_EXEC).trim(),
    branch: execFileSync('/usr/bin/git', ['branch', '--show-current'], SAFE_EXEC).trim(),
    remoteHeadSha: lsRemote(`refs/heads/${certificate.branch}`),
    writerMapDigest: sha256(canonicalJson(changedPaths)),
    pr: certificate.prNumber === null ? readPrForBranch(certificate) : readPr(certificate.prNumber),
  };
}

export function readLiveOperationAuthority(boundary) {
  return resolveAtAuthorityBoundary({
    boundary,
    readLiveAuthority: () =>
      authenticateResolverOutput(resolveRepositoryAuthority(process.cwd(), true)),
  }).authority;
}

export function verifyLiveOperationFacts(facts, certificate, operation) {
  must(facts && typeof facts === 'object', 'live operation facts are unavailable');
  for (const key of [
    'origin',
    'baseSha',
    'headSha',
    'treeSha',
    'branch',
    'remoteHeadSha',
    'writerMapDigest',
    'pr',
  ])
    must(Object.hasOwn(facts, key), 'live operation facts are unavailable');
  must(facts.origin === certificate.origin, 'live origin differs from certificate');
  must(facts.baseSha === certificate.baseSha, 'live protected base differs from certificate');
  must(facts.headSha === certificate.headSha, 'exact local head differs from approved head');
  must(facts.treeSha === certificate.treeSha, 'exact local tree differs from approved tree');
  must(facts.branch === certificate.branch, 'exact branch differs from certificate');
  must(
    facts.remoteHeadSha === certificate.expectedRemoteHeadSha,
    'exact remote branch head differs from certificate'
  );
  must(
    facts.writerMapDigest === certificate.writerMapDigest,
    'live writer map differs from certificate'
  );
  if (certificate.prNumber === null) {
    must(facts.pr === null, 'PR creation requires no existing exact PR');
  } else {
    must(facts.pr?.number === certificate.prNumber, 'live PR identity differs from certificate');
    must(
      facts.pr.baseBranch === certificate.baseBranch && facts.pr.branch === certificate.branch,
      'live PR branch identity differs'
    );
    const expectedPrHead =
      operation === 'branch_push' ? certificate.expectedRemoteHeadSha : certificate.headSha;
    must(facts.pr.headSha === expectedPrHead, 'exact PR head differs from approved precondition');
    must(facts.pr.origin === 'interdomestik/interdomestik', 'live PR repository differs');
  }
}

export function verifyOperationAuthority(authority, certificate) {
  must(authority?.source === 'live-resolver', 'operation requires live resolver authority');
  if (certificate.workClass === 'product') {
    must(
      authority.runtimeAuthorized === true && authority.activeSlice === certificate.sliceId,
      'product operation authority differs'
    );
  } else {
    must(
      authority.runtimeAuthorized === false && authority.activeSlice === null,
      'governance operation requires inactive product authority'
    );
  }
}

export function verifyOperationBody(request, certificate) {
  if (!Object.hasOwn(request, 'bodyArtifact')) return;
  const content = readBoundedRegularText(operationBodyArtifact(certificate, request.bodyArtifact), {
    label: 'Operation body artifact',
    maxBytes: 256 * 1024,
    allowedRoots: [OPERATION_ARTIFACT_ROOT],
  });
  must(
    sha256(content) === certificate.artifacts[request.bodyArtifact],
    'operation body artifact digest differs'
  );
}

export function executeOperation(binary, args) {
  return spawnSync(binary === 'gh' ? resolveGhBinary() : binary, args, {
    ...SAFE_EXEC,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function reconcileOperation(request, certificate) {
  try {
    if (request.operation === 'branch_push') {
      return {
        outcome:
          lsRemote(`refs/heads/${certificate.branch}`) === certificate.headSha
            ? 'applied'
            : 'not_applied',
      };
    }
    if (request.operation === 'pr_create') {
      const pull = readPrForBranch(certificate);
      return {
        outcome:
          pull?.headSha === certificate.headSha &&
          pull.branch === certificate.branch &&
          pull.baseBranch === certificate.baseBranch
            ? 'applied'
            : 'not_applied',
        prNumber: pull?.number ?? null,
      };
    }
    if (request.operation === 'label_add') {
      const labels = JSON.parse(
        execFileSync(
          resolveGhBinary(),
          ['pr', 'view', String(request.prNumber), '--json', 'labels', '--jq', '[.labels[].name]'],
          SAFE_EXEC
        )
      );
      return { outcome: labels.includes(request.label) ? 'applied' : 'not_applied' };
    }
    if (request.operation === 'feedback_comment') {
      const comments = JSON.parse(
        execFileSync(
          resolveGhBinary(),
          [
            'api',
            `repos/interdomestik/interdomestik/issues/${request.prNumber}/comments?per_page=100`,
            '--paginate',
          ],
          SAFE_EXEC
        )
      );
      const expected = certificate.artifacts[request.bodyArtifact];
      return {
        outcome: comments.some(comment => sha256(comment?.body ?? '') === expected)
          ? 'applied'
          : 'not_applied',
      };
    }
    const merge = JSON.parse(
      execFileSync(
        resolveGhBinary(),
        ['pr', 'view', String(request.prNumber), '--json', 'state,mergedAt,mergeCommit'],
        SAFE_EXEC
      )
    );
    return {
      outcome:
        merge.state === 'MERGED' && merge.mergedAt && /^[0-9a-f]{40}$/u.test(merge.mergeCommit?.oid)
          ? 'applied'
          : 'not_applied',
      mergeSha: merge.mergeCommit?.oid ?? null,
    };
  } catch {
    return { outcome: 'unknown' };
  }
}
