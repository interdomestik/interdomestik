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
  timeout: 30_000,
});
const PROVIDER_ENVIRONMENT_KEYS =
  'HOME XDG_CONFIG_HOME GH_CONFIG_DIR GH_HOST GH_TOKEN GH_ENTERPRISE_TOKEN GITHUB_TOKEN'.split(' ');
const GIT_AUTH_ENVIRONMENT_KEYS = 'HOME XDG_CONFIG_HOME SSH_AUTH_SOCK'.split(' ');
const PULL_FIELDS = 'number,headRefOid,headRefName,baseRefName,headRepository,headRepositoryOwner';
const LIVE_FACT_KEYS =
  'origin baseSha headSha treeSha branch remoteHeadSha writerMapDigest pr'.split(' ');
const git = args => execFileSync('/usr/bin/git', args, SAFE_EXEC);
export function safeGitHubEnvironment(environment = process.env, keys = PROVIDER_ENVIRONMENT_KEYS) {
  const safe = { PATH: SAFE_EXEC.env.PATH };
  for (const key of keys)
    if (typeof environment[key] === 'string' && environment[key].length > 0)
      safe[key] = environment[key];
  return safe;
}
export function execOptions(binary, environment = process.env) {
  const git = binary === 'git' || binary.endsWith('/git');
  if (binary !== 'gh' && !git) return SAFE_EXEC;
  const env = safeGitHubEnvironment(
    environment,
    git ? GIT_AUTH_ENVIRONMENT_KEYS : PROVIDER_ENVIRONMENT_KEYS
  );
  if (git) env.GIT_TERMINAL_PROMPT = '0';
  return { ...SAFE_EXEC, env };
}
export function resolveGhBinary() {
  const binary = GH_CANDIDATES.find(existsSync);
  must(binary, `gh not found: ${GH_CANDIDATES.join(', ')}`);
  return binary;
}
function ghJson(args) {
  return JSON.parse(execFileSync(resolveGhBinary(), args, execOptions('gh')));
}
function lsRemoteRefs(refs) {
  const output = execFileSync(
    '/usr/bin/git',
    ['ls-remote', '--refs', 'origin', ...refs],
    SAFE_EXEC
  ).trim();
  const resolved = Object.fromEntries(refs.map(ref => [ref, null]));
  for (const line of output.split('\n').filter(Boolean)) {
    const [sha, ref, extra] = line.split(/\s+/u);
    must(!extra && Object.hasOwn(resolved, ref) && resolved[ref] === null, 'remote refs ambiguous');
    resolved[ref] = normalizeCommitSha(sha, 'remote head SHA');
  }
  return resolved;
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
  return normalizePull(ghJson(['pr', 'view', String(prNumber), '--json', PULL_FIELDS]));
}
function readPrForBranch(certificate) {
  const args = ['pr', 'list', '--state', 'all'];
  args.push('--head', certificate.branch, '--base', certificate.baseBranch);
  args.push('--limit', '2', '--json', PULL_FIELDS);
  const values = ghJson(args);
  must(Array.isArray(values) && values.length <= 1, 'PR lookup ambiguous');
  return values.length ? normalizePull(values[0]) : null;
}
export function readLiveOperationFacts(request, certificate) {
  const baseRef = `refs/heads/${certificate.baseBranch}`;
  const branchRef = `refs/heads/${certificate.branch}`;
  const remoteRefs = lsRemoteRefs([baseRef, branchRef]);
  const range = `${certificate.baseSha}...${certificate.headSha}`;
  const changedPaths = git(['diff', '--name-only', '-z', range])
    .split('\0')
    .filter(Boolean)
    .sort(compareText);
  const mergeSetting =
    certificate.mergeMethod === 'merge'
      ? 'allow_merge_commit'
      : `allow_${certificate.mergeMethod}_merge`;
  return {
    origin: normalizeGitHubOrigin(git(['config', '--get', 'remote.origin.url']).trim()).origin,
    baseSha: remoteRefs[baseRef],
    headSha: git(['rev-parse', 'HEAD']).trim(),
    treeSha: git(['rev-parse', 'HEAD^{tree}']).trim(),
    branch: git(['branch', '--show-current']).trim(),
    remoteHeadSha: remoteRefs[branchRef],
    writerMapDigest: sha256(canonicalJson(changedPaths)),
    mergeAllowed:
      request.operation === 'conditional_merge'
        ? ghJson(['api', `repos/${normalizeGitHubOrigin(certificate.origin).providerRepository}`])[
            mergeSetting
          ] === true
        : null,
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
  must(facts && typeof facts === 'object', 'live facts unavailable');
  for (const key of LIVE_FACT_KEYS) must(Object.hasOwn(facts, key), 'live facts unavailable');
  must(facts.origin === certificate.origin, 'origin differs');
  must(facts.baseSha === certificate.baseSha, 'base differs');
  must(facts.headSha === certificate.headSha, 'exact local head differs from approved head');
  must(facts.treeSha === certificate.treeSha, 'local tree differs');
  must(facts.branch === certificate.branch, 'branch differs');
  must(
    facts.remoteHeadSha === certificate.expectedRemoteHeadSha,
    'exact remote branch head differs from certificate'
  );
  must(facts.writerMapDigest === certificate.writerMapDigest, 'live writer map differs');
  if (operation === 'conditional_merge')
    must(facts.mergeAllowed === true, 'merge method is not enabled');
  if (certificate.prNumber === null) {
    must(facts.pr === null, 'existing PR blocks creation');
  } else {
    must(facts.pr?.number === certificate.prNumber, 'live PR differs');
    must(
      facts.pr.baseBranch === certificate.baseBranch && facts.pr.branch === certificate.branch,
      'live PR branches differ'
    );
    const expectedPrHead =
      operation === 'branch_push' ? certificate.expectedRemoteHeadSha : certificate.headSha;
    must(facts.pr.headSha === expectedPrHead, 'exact PR head differs');
    must(facts.pr.origin === 'interdomestik/interdomestik', 'PR repo differs');
  }
}
export function verifyOperationAuthority(authority, certificate) {
  must(authority?.source === 'live-resolver', 'live resolver required');
  if (certificate.workClass === 'product') {
    must(
      authority.runtimeAuthorized === true && authority.activeSlice === certificate.sliceId,
      'product authority differs'
    );
  } else {
    must(
      authority.runtimeAuthorized === false && authority.activeSlice === null,
      'governance requires inactive product'
    );
  }
}
export function verifyOperationBody(request, certificate) {
  if (!Object.hasOwn(request, 'bodyArtifact')) return;
  const content = readBoundedRegularText(operationBodyArtifact(certificate, request.bodyArtifact), {
    label: 'Operation body',
    maxBytes: 256 * 1024,
    allowedRoots: [OPERATION_ARTIFACT_ROOT],
  });
  must(
    sha256(content) === certificate.artifacts[request.bodyArtifact],
    'body artifact digest differs'
  );
}
export function executeOperation(binary, args) {
  return spawnSync(binary === 'gh' ? resolveGhBinary() : binary, args, {
    ...execOptions(binary),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
const reconciliationOutcome = applied => (applied ? 'applied' : 'not_applied');
export function classifyMergeReconciliation(facts, certificate) {
  const pull = facts?.pull;
  const commit = pull?.mergeCommit;
  if (!pull || typeof pull.state !== 'string') return { outcome: 'unknown', mergeSha: null };
  if (pull.state !== 'MERGED') return { outcome: 'not_applied', mergeSha: null };
  const applied =
    pull.merged === true &&
    pull.baseRefName === certificate.baseBranch &&
    pull.headRefName === certificate.branch &&
    pull.headRefOid === certificate.headSha &&
    commit?.parents?.totalCount === 1 &&
    commit.parents.nodes[0]?.oid === certificate.baseSha &&
    commit.tree?.oid === certificate.treeSha &&
    facts.mainSha === commit.oid &&
    facts.authority?.lifecycle === 'consumed_on_merge' &&
    facts.authority.mergeSha === commit.oid;
  return {
    outcome: applied ? 'applied' : 'unknown',
    mergeSha: commit?.oid ?? null,
  };
}
function reconcileMerge(certificate) {
  const query = `query($number:Int!){repository(owner:"interdomestik",name:"interdomestik"){ref(qualifiedName:"refs/heads/main"){target{oid}} pullRequest(number:$number){state merged baseRefName headRefName headRefOid mergeCommit{oid tree{oid} parents(first:2){totalCount nodes{oid}}}}}}`;
  const repository = ghJson([
    'api',
    'graphql',
    '-f',
    `query=${query}`,
    '-F',
    `number=${certificate.prNumber}`,
  ])?.data?.repository;
  return classifyMergeReconciliation(
    {
      mainSha: repository?.ref?.target?.oid,
      pull: repository?.pullRequest,
      authority: readLiveOperationAuthority('post_merge'),
    },
    certificate
  );
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
    const labels = ghJson([
      'pr',
      'view',
      String(request.prNumber),
      '--json',
      'labels',
      '--jq',
      '[.labels[].name]',
    ]);
    return { outcome: reconciliationOutcome(labels.includes(request.label)) };
  }
  if (request.operation === 'feedback_comment') {
    const endpoint = `repos/interdomestik/interdomestik/issues/${request.prNumber}/comments?per_page=100`;
    const comments = ghJson(['api', endpoint, '--paginate']);
    const expected = certificate.artifacts[request.bodyArtifact];
    return {
      outcome: reconciliationOutcome(
        comments.some(comment => sha256(comment?.body ?? '') === expected)
      ),
    };
  }
  return reconcileMerge(certificate);
}
export function reconcileOperation(request, certificate) {
  try {
    if (request.operation === 'branch_push') {
      const ref = `refs/heads/${certificate.branch}`;
      const remote = lsRemoteRefs([ref])[ref];
      return { outcome: reconciliationOutcome(remote === certificate.headSha) };
    }
    if (request.operation === 'pr_create') return reconcilePullCreation(certificate);
    return reconcilePullMutation(request, certificate);
  } catch {
    return { outcome: 'unknown' };
  }
}
