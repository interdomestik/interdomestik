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
const PROVIDER_ENVIRONMENT_KEYS =
  'HOME XDG_CONFIG_HOME GH_CONFIG_DIR GH_HOST GH_TOKEN GH_ENTERPRISE_TOKEN GITHUB_TOKEN'.split(' ');

export function safeGitHubEnvironment(environment = process.env) {
  const safe = { PATH: SAFE_EXEC.env.PATH };
  for (const key of PROVIDER_ENVIRONMENT_KEYS) {
    if (typeof environment[key] === 'string' && environment[key].length > 0) {
      safe[key] = environment[key];
    }
  }
  return safe;
}

function providerExecOptions() {
  return { ...SAFE_EXEC, env: safeGitHubEnvironment() };
}

export function resolveGhBinary() {
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

export function normalizeHeadRepository(repository, owner) {
  if (repository?.nameWithOwner?.trim()) return repository.nameWithOwner.trim().toLowerCase();
  const login = owner?.login?.trim();
  const name = repository?.name?.trim();
  return login && name ? `${login}/${name}`.toLowerCase() : null;
}

function normalizePull(value) {
  return {
    number: value.number,
    baseBranch: value.baseRefName,
    branch: value.headRefName,
    headSha: value.headRefOid,
    origin: normalizeHeadRepository(value.headRepository, value.headRepositoryOwner),
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
          'number,headRefOid,headRefName,baseRefName,headRepository,headRepositoryOwner',
        ],
        providerExecOptions()
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
        'number,headRefOid,headRefName,baseRefName,headRepository,headRepositoryOwner',
      ],
      providerExecOptions()
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
    ...(binary === 'gh' || binary === '/usr/bin/git' ? providerExecOptions() : SAFE_EXEC),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function reconciliationOutcome(applied) {
  return applied ? 'applied' : 'not_applied';
}

function reconcilePullCreation(certificate) {
  const pull = readPrForBranch(certificate);
  const applied =
    pull?.headSha === certificate.headSha &&
    pull.branch === certificate.branch &&
    pull.baseBranch === certificate.baseBranch;
  return { outcome: reconciliationOutcome(applied), prNumber: pull?.number ?? null };
}

function reconcilePullMutation(request, certificate) {
  if (request.operation === 'label_add') {
    const labels = JSON.parse(
      execFileSync(
        resolveGhBinary(),
        ['pr', 'view', String(request.prNumber), '--json', 'labels', '--jq', '[.labels[].name]'],
        providerExecOptions()
      )
    );
    return { outcome: reconciliationOutcome(labels.includes(request.label)) };
  }
  if (request.operation === 'feedback_comment') {
    const endpoint = `repos/interdomestik/interdomestik/issues/${request.prNumber}/comments?per_page=100`;
    const comments = JSON.parse(
      execFileSync(resolveGhBinary(), ['api', endpoint, '--paginate'], providerExecOptions())
    );
    const expected = certificate.artifacts[request.bodyArtifact];
    return {
      outcome: reconciliationOutcome(
        comments.some(comment => sha256(comment?.body ?? '') === expected)
      ),
    };
  }
  const merge = JSON.parse(
    execFileSync(
      resolveGhBinary(),
      ['pr', 'view', String(request.prNumber), '--json', 'state,mergedAt,mergeCommit'],
      providerExecOptions()
    )
  );
  const applied =
    merge.state === 'MERGED' && merge.mergedAt && /^[0-9a-f]{40}$/u.test(merge.mergeCommit?.oid);
  return { outcome: reconciliationOutcome(applied), mergeSha: merge.mergeCommit?.oid ?? null };
}

export function reconcileOperation(request, certificate) {
  try {
    if (request.operation === 'branch_push') {
      const remote = lsRemote(`refs/heads/${certificate.branch}`);
      return { outcome: reconciliationOutcome(remote === certificate.headSha) };
    }
    if (request.operation === 'pr_create') return reconcilePullCreation(certificate);
    return reconcilePullMutation(request, certificate);
  } catch {
    return { outcome: 'unknown' };
  }
}
