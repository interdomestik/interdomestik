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
const GH = ['/usr/bin/gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh'];
const EXEC = Object.freeze({
  encoding: 'utf8',
  env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
  maxBuffer: 8 * 1024 * 1024,
  timeout: 30_000,
});
const GH_ENV =
  'HOME XDG_CONFIG_HOME GH_CONFIG_DIR GH_HOST GH_TOKEN GH_ENTERPRISE_TOKEN GITHUB_TOKEN'.split(' ');
const GIT_ENV = 'HOME XDG_CONFIG_HOME SSH_AUTH_SOCK'.split(' ');
const FIELDS =
  'number,state,headRefOid,headRefName,baseRefOid,baseRefName,headRepository,headRepositoryOwner';
const FACTS = 'origin baseSha headSha treeSha branch remoteHeadSha writerMapDigest pr'.split(' ');
const same = (a, b) =>
  'baseBranch baseSha branch headSha number'.split(' ').every(key => a?.[key] === b?.[key]);
const git = args => execFileSync('/usr/bin/git', args, EXEC);
export function safeGitHubEnvironment(e = process.env, keys = GH_ENV) {
  const safe = { PATH: EXEC.env.PATH };
  for (const k of keys) if (typeof e[k] === 'string' && e[k]) safe[k] = e[k];
  return safe;
}
export function execOptions(b, e = process.env) {
  const isGit = b === 'git' || b.endsWith('/git');
  if (b !== 'gh' && !isGit) return EXEC;
  const env = safeGitHubEnvironment(e, isGit ? GIT_ENV : GH_ENV);
  if (isGit) env.GIT_TERMINAL_PROMPT = '0';
  return { ...EXEC, env };
}
// prettier-ignore
export const stalePrRole = c => c.rehearsalReport.operationalEnvelope?.lifecycle?.target.prRoles.find(role => role.role === 'stale-prerequisite');
// prettier-ignore
export function verifyStalePrLiveFacts(f, c) {
  const role = stalePrRole(c);
  const valid = same(f.pr, role) && f.pr?.origin === normalizeGitHubOrigin(c.origin).providerRepository && f.pr.state === 'OPEN';
  must(valid, 'live stale PR differs from compiled lifecycle');
}
// prettier-ignore
export function classifyStalePrReconciliation(f, t) {
  const p = f?.pull;
  if (!p || typeof p.state !== 'string') return { outcome: 'unknown' };
  const origin = normalizeGitHubOrigin(t.origin).providerRepository;
  if (!same(p, t) || ![origin, t.origin].includes(p.origin)) return { outcome: 'unknown' };
  if (p.state === 'CLOSED') return { outcome: 'applied' };
  return { outcome: p.state === 'OPEN' ? 'not_applied' : 'unknown' };
}
export function resolveGhBinary() {
  const p = GH.find(existsSync);
  must(p, `gh not found: ${GH.join(', ')}`);
  return p;
}
function ghJson(a) {
  return JSON.parse(execFileSync(resolveGhBinary(), a, execOptions('gh')));
}
function lsRemoteRefs(refs) {
  const text = git(['ls-remote', '--refs', 'origin', ...refs]).trim();
  const map = Object.fromEntries(refs.map(ref => [ref, null]));
  for (const line of text.split('\n').filter(Boolean)) {
    const [sha, ref, extra] = line.split(/\s+/u);
    must(!extra && Object.hasOwn(map, ref) && map[ref] === null, 'remote refs ambiguous');
    map[ref] = normalizeCommitSha(sha, 'remote head SHA');
  }
  return map;
}
export function normalizeHeadRepository(r, o) {
  if (r?.nameWithOwner?.trim()) return r.nameWithOwner.trim().toLowerCase();
  const login = o?.login?.trim();
  const name = r?.name?.trim();
  return login && name ? `${login}/${name}`.toLowerCase() : null;
}
function normalizePull(v) {
  return {
    number: v.number,
    baseBranch: v.baseRefName,
    baseSha: v.baseRefOid,
    branch: v.headRefName,
    headSha: v.headRefOid,
    origin: normalizeHeadRepository(v.headRepository, v.headRepositoryOwner),
    state: v.state,
  };
}
function readPr(number) {
  return normalizePull(ghJson(['pr', 'view', String(number), '--json', FIELDS]));
}
function readPrForBranch(c) {
  const args = ['pr', 'list', '--state', 'all'];
  args.push('--head', c.branch, '--base', c.baseBranch, '--limit', '2', '--json', FIELDS);
  const values = ghJson(args);
  must(Array.isArray(values) && values.length <= 1, 'PR lookup ambiguous');
  return values.length ? normalizePull(values[0]) : null;
}
// prettier-ignore
export function readLiveOperationFacts(r, c) {
  const base = `refs/heads/${c.baseBranch}`;
  const branch = `refs/heads/${c.branch}`;
  const remote = lsRemoteRefs([base, branch]);
  const range = `${c.baseSha}...${c.headSha}`;
  const paths = git(['diff', '--name-only', '-z', range]).split('\0').filter(Boolean).sort(compareText);
  const setting = c.mergeMethod === 'merge' ? 'allow_merge_commit' : `allow_${c.mergeMethod}_merge`;
  let pr;
  if (r.operation === 'stale_pr_disposition') pr = readPr(r.prNumber);
  else pr = c.prNumber === null ? readPrForBranch(c) : readPr(c.prNumber);
  return {
    origin: normalizeGitHubOrigin(git(['config', '--get', 'remote.origin.url']).trim()).origin,
    baseSha: remote[base],
    headSha: git(['rev-parse', 'HEAD']).trim(),
    treeSha: git(['rev-parse', 'HEAD^{tree}']).trim(),
    branch: git(['branch', '--show-current']).trim(),
    remoteHeadSha: remote[branch],
    writerMapDigest: sha256(canonicalJson(paths)),
    mergeAllowed: r.operation === 'conditional_merge' ? ghJson(['api', `repos/${normalizeGitHubOrigin(c.origin).providerRepository}`])[setting] === true : null,
    pr,
  };
}
export function readLiveOperationAuthority(b) {
  return resolveAtAuthorityBoundary({
    boundary: b,
    readLiveAuthority: () =>
      authenticateResolverOutput(resolveRepositoryAuthority(process.cwd(), true)),
  }).authority;
}
export function verifyLiveOperationFacts(f, c, op) {
  must(f && typeof f === 'object', 'live facts unavailable');
  for (const key of FACTS) must(Object.hasOwn(f, key), 'live facts unavailable');
  must(f.origin === c.origin, 'origin differs');
  must(f.baseSha === c.baseSha, 'base differs');
  must(f.headSha === c.headSha, 'exact local head differs from approved head');
  must(f.treeSha === c.treeSha, 'local tree differs');
  must(f.branch === c.branch, 'branch differs');
  must(
    f.remoteHeadSha === c.expectedRemoteHeadSha,
    'exact remote branch head differs from certificate'
  );
  must(f.writerMapDigest === c.writerMapDigest, 'live writer map differs');
  if (op === 'conditional_merge') must(f.mergeAllowed === true, 'merge method is not enabled');
  if (op === 'stale_pr_disposition') {
    verifyStalePrLiveFacts(f, c);
    return;
  }
  if (c.prNumber === null) {
    must(f.pr === null, 'existing PR blocks creation');
  } else {
    must(f.pr?.number === c.prNumber, 'live PR differs');
    must(f.pr.baseBranch === c.baseBranch && f.pr.branch === c.branch, 'live PR branches differ');
    const expected = op === 'branch_push' ? c.expectedRemoteHeadSha : c.headSha;
    must(f.pr.headSha === expected, 'exact PR head differs');
    must(f.pr.origin === 'interdomestik/interdomestik', 'PR repo differs');
  }
}
export function verifyOperationAuthority(a, c) {
  must(a?.source === 'live-resolver', 'live resolver required');
  if (c.workClass === 'product') {
    must(a.runtimeAuthorized === true && a.activeSlice === c.sliceId, 'product authority differs');
  } else {
    must(
      a.runtimeAuthorized === false && a.activeSlice === null,
      'governance requires inactive product'
    );
  }
}
export function verifyOperationBody(r, c) {
  if (!Object.hasOwn(r, 'bodyArtifact')) return;
  const content = readBoundedRegularText(operationBodyArtifact(c, r.bodyArtifact), {
    label: 'Operation body',
    maxBytes: 256 * 1024,
    allowedRoots: [OPERATION_ARTIFACT_ROOT],
  });
  must(sha256(content) === c.artifacts[r.bodyArtifact], 'body artifact digest differs');
}
export function executeOperation(binary, args) {
  return spawnSync(binary === 'gh' ? resolveGhBinary() : binary, args, {
    ...execOptions(binary),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
const outcome = ok => (ok ? 'applied' : 'not_applied');
export function classifyMergeReconciliation(f, c) {
  const p = f?.pull;
  const m = p?.mergeCommit;
  if (!p || typeof p.state !== 'string') return { outcome: 'unknown', mergeSha: null };
  if (p.state !== 'MERGED') return { outcome: 'not_applied', mergeSha: null };
  const ok =
    p.merged === true &&
    p.baseRefName === c.baseBranch &&
    p.headRefName === c.branch &&
    p.headRefOid === c.headSha &&
    m?.parents?.totalCount === 1 &&
    m.parents.nodes[0]?.oid === c.baseSha &&
    m.tree?.oid === c.treeSha &&
    f.mainSha === m.oid &&
    f.authority?.lifecycle === 'consumed_on_merge' &&
    f.authority.mergeSha === m.oid;
  return {
    outcome: ok ? 'applied' : 'unknown',
    mergeSha: m?.oid ?? null,
  };
}
function reconcileMerge(c) {
  const query = `query($number:Int!){repository(owner:"interdomestik",name:"interdomestik"){ref(qualifiedName:"refs/heads/main"){target{oid}} pullRequest(number:$number){state merged baseRefName headRefName headRefOid mergeCommit{oid tree{oid} parents(first:2){totalCount nodes{oid}}}}}}`;
  const repo = ghJson(['api', 'graphql', '-f', `query=${query}`, '-F', `number=${c.prNumber}`])
    ?.data?.repository;
  return classifyMergeReconciliation(
    {
      mainSha: repo?.ref?.target?.oid,
      pull: repo?.pullRequest,
      authority: readLiveOperationAuthority('post_merge'),
    },
    c
  );
}
function reconcilePullCreation(c) {
  const pull = readPrForBranch(c);
  const ok =
    pull?.headSha === c.headSha && pull.branch === c.branch && pull.baseBranch === c.baseBranch;
  return { outcome: outcome(ok), prNumber: pull?.number ?? null };
}
function reconcilePullMutation(r, c) {
  if (r.operation === 'stale_pr_disposition') {
    const stale = stalePrRole(c);
    return stale
      ? classifyStalePrReconciliation({ pull: readPr(r.prNumber) }, { ...stale, origin: c.origin })
      : { outcome: 'unknown' };
  }
  if (r.operation === 'label_add') {
    const labels = ghJson([
      'pr',
      'view',
      String(r.prNumber),
      '--json',
      'labels',
      '--jq',
      '[.labels[].name]',
    ]);
    return { outcome: outcome(labels.includes(r.label)) };
  }
  if (r.operation === 'feedback_comment') {
    const endpoint = `repos/interdomestik/interdomestik/issues/${r.prNumber}/comments?per_page=100`;
    const comments = ghJson(['api', endpoint, '--paginate']);
    const expected = c.artifacts[r.bodyArtifact];
    return {
      outcome: outcome(comments.some(comment => sha256(comment?.body ?? '') === expected)),
    };
  }
  return reconcileMerge(c);
}
export function reconcileOperation(r, c) {
  try {
    if (r.operation === 'branch_push') {
      const ref = `refs/heads/${c.branch}`;
      const remote = lsRemoteRefs([ref])[ref];
      return { outcome: outcome(remote === c.headSha) };
    }
    if (r.operation === 'pr_create') return reconcilePullCreation(c);
    return reconcilePullMutation(r, c);
  } catch {
    return { outcome: 'unknown' };
  }
}
