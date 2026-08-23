import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  alphabetical,
  CANONICAL_ORIGIN,
  normalizeOrigin,
  validateProjection,
  writerMapDigest,
} from '../current-authority-state-lib.mjs';

const SHA40 = /^[a-f0-9]{40}$/u;
const CONDITIONAL_GOVERNANCE_WRITER = 'scripts/repo-size-budget.json';
const FACT_KEYS =
  'schemaVersion,repository,origin,mergeMethod,base,head,testedMerge,returnedMain,protectedMain,pullRequest,worktree,mcp,commits,writerPaths,writerMapSha256,requiredContexts,terminalDelivery,finalIntake,lanes'.split(
    ','
  );

function must(value, message) {
  if (!value) throw new Error(message);
}

function exactKeys(value, keys, label) {
  must(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  must(
    JSON.stringify(Object.keys(value).sort(alphabetical)) ===
      JSON.stringify([...keys].sort(alphabetical)),
    `${label} keys mismatch`
  );
}

function safeWriters(paths) {
  must(
    Array.isArray(paths) && paths.length > 0 && new Set(paths).size === paths.length,
    'invalid writer paths'
  );
  must(
    paths.every(
      path =>
        typeof path === 'string' &&
        path.length > 0 &&
        !path.startsWith('/') &&
        !path.startsWith('../') &&
        !path.includes('/../')
    ),
    'unsafe writer path'
  );
}

export function writerDigest(paths) {
  safeWriters(paths);
  return createHash('sha256')
    .update(JSON.stringify([...paths].sort(alphabetical)))
    .digest('hex');
}

function verifyAuthority(facts, authority) {
  exactKeys(
    authority,
    [
      'projection',
      'origin',
      'pullRequest',
      'worktree',
      'commits',
      'protectedMain',
      'changedPaths',
      'requiredChecks',
    ],
    'delivery authority'
  );
  validateProjection(authority.projection);
  must(authority.projection.sourceMain === facts.base, 'projection base mismatch');
  must(
    normalizeOrigin(authority.origin) === CANONICAL_ORIGIN &&
      normalizeOrigin(facts.origin) === normalizeOrigin(authority.origin),
    'authoritative origin mismatch'
  );
  must(same(facts.pullRequest, authority.pullRequest), 'live pull request identity mismatch');
  must(same(facts.worktree, authority.worktree), 'live worktree identity mismatch');
  must(same(facts.commits, authority.commits), 'live commit identity mismatch');
  must(facts.protectedMain === authority.protectedMain, 'live protected main mismatch');
  const projected = authority.projection.writerPaths;
  must(
    writerMapDigest(projected) === authority.projection.writerMapSha256 &&
      writerDigest(facts.writerPaths) === authority.projection.writerMapSha256 &&
      same([...facts.writerPaths].sort(alphabetical), [...projected].sort(alphabetical)),
    'approved writer map mismatch'
  );
  must(
    Array.isArray(authority.changedPaths) &&
      new Set(authority.changedPaths).size === authority.changedPaths.length &&
      authority.changedPaths.every(path => typeof path === 'string' && path.length > 0),
    'changed path inventory mismatch'
  );
  const allowed = new Set([...projected, CONDITIONAL_GOVERNANCE_WRITER]);
  must(
    projected.every(path => authority.changedPaths.includes(path)) &&
      authority.changedPaths.every(path => allowed.has(path)),
    'actual changed paths exceed approved writer map'
  );
  must(
    Array.isArray(authority.requiredChecks) && authority.requiredChecks.length > 0,
    'required checks missing'
  );
  for (const check of authority.requiredChecks) {
    exactKeys(check, ['context', 'appId'], 'required check');
    must(
      typeof check.context === 'string' &&
        check.context.length > 0 &&
        Number.isSafeInteger(check.appId) &&
        check.appId > 0,
      'required check identity mismatch'
    );
  }
  must(
    new Set(authority.requiredChecks.map(check => check.context)).size ===
      authority.requiredChecks.length,
    'duplicate required check'
  );
  const contexts = authority.requiredChecks.map(check => check.context).sort(alphabetical);
  must(
    same([...facts.requiredContexts].sort(alphabetical), contexts),
    'authoritative required context mismatch'
  );
  return new Map(authority.requiredChecks.map(check => [check.context, check.appId]));
}

function commit(value, sha) {
  exactKeys(value, ['parents', 'tree'], `commit ${sha}`);
  must(
    Array.isArray(value.parents) && value.parents.every(parent => SHA40.test(parent)),
    'commit parents mismatch'
  );
  must(SHA40.test(value.tree), 'commit tree mismatch');
  return value;
}

function same(left, right) {
  return isDeepStrictEqual(left, right);
}

function verifyRuntimeIdentity(facts) {
  exactKeys(
    facts.pullRequest,
    ['number', 'state', 'baseRef', 'headRef', 'baseSha', 'headSha', 'mergeCommitSha'],
    'pull request identity'
  );
  exactKeys(facts.worktree, ['root', 'commonDir', 'head', 'branch'], 'worktree identity');
  exactKeys(
    facts.mcp,
    [
      'sourceRoot',
      'sourceHead',
      'sourceCommonDir',
      'targetRoot',
      'targetHead',
      'targetCommonDir',
      'repoRoot',
    ],
    'MCP identity'
  );
  must(
    Number.isSafeInteger(facts.pullRequest.number) && facts.pullRequest.number > 0,
    'pull request number mismatch'
  );
  must(facts.pullRequest.state === 'MERGED', 'pull request state mismatch');
  must(
    facts.pullRequest.baseRef === 'main' &&
      facts.pullRequest.baseSha === facts.base &&
      facts.pullRequest.headSha === facts.head &&
      facts.pullRequest.mergeCommitSha === facts.returnedMain,
    'pull request commit mismatch'
  );
  const paths = [
    facts.worktree.root,
    facts.worktree.commonDir,
    facts.mcp.sourceRoot,
    facts.mcp.sourceCommonDir,
    facts.mcp.targetRoot,
    facts.mcp.targetCommonDir,
    facts.mcp.repoRoot,
  ];
  must(
    paths.every(value => typeof value === 'string' && isAbsolute(value)),
    'runtime path mismatch'
  );
  must(
    facts.worktree.branch === facts.pullRequest.headRef && facts.worktree.head === facts.head,
    'worktree identity mismatch'
  );
  must(facts.mcp.sourceRoot !== facts.mcp.targetRoot, 'MCP source/target collision');
  must(SHA40.test(facts.mcp.sourceHead), 'MCP source head mismatch');
  must(
    facts.mcp.targetRoot === facts.worktree.root &&
      facts.mcp.targetHead === facts.head &&
      facts.mcp.repoRoot === facts.worktree.root,
    'MCP target identity mismatch'
  );
  must(
    facts.mcp.sourceCommonDir === facts.worktree.commonDir &&
      facts.mcp.targetCommonDir === facts.worktree.commonDir,
    'Git common directory mismatch'
  );
}

function verifyLane(lane, facts, testedTree, headTree, requiredApps) {
  exactKeys(
    lane,
    ['name', 'checkedSha', 'checkedTree', 'runId', 'runAttempt', 'appId', 'conclusion'],
    'lane identity'
  );
  const identity =
    typeof lane.name === 'string' &&
    lane.name.length > 0 &&
    Number.isSafeInteger(lane.runId) &&
    lane.runId > 0 &&
    Number.isSafeInteger(lane.runAttempt) &&
    lane.runAttempt > 0 &&
    Number.isSafeInteger(lane.appId) &&
    lane.appId > 0 &&
    lane.conclusion === 'success' &&
    requiredApps.get(lane.name) === lane.appId;
  must(identity, 'lane identity mismatch');
  if (lane.checkedSha === facts.testedMerge) {
    must(lane.checkedTree === testedTree, 'tested lane tree mismatch');
    return;
  }
  must(lane.checkedSha === facts.head, 'lane checked unknown SHA');
  must(
    headTree === testedTree && lane.checkedTree === headTree,
    'head-only lane lacks tree equality'
  );
}

export function verifyExactDelivery(facts, authority) {
  exactKeys(facts, FACT_KEYS, 'delivery facts');
  must(
    facts.schemaVersion === 1 && facts.repository === 'interdomestik/interdomestik',
    'repository mismatch'
  );
  must(
    normalizeOrigin(facts.origin) === CANONICAL_ORIGIN && facts.mergeMethod === 'SQUASH',
    'origin or merge method mismatch'
  );
  const requiredApps = verifyAuthority(facts, authority);
  const commits = [facts.base, facts.head, facts.testedMerge, facts.returnedMain];
  const ids = [...commits, facts.protectedMain];
  must(
    ids.every(value => SHA40.test(value)) && new Set(commits).size === commits.length,
    'delivery SHA mismatch'
  );
  exactKeys(facts.commits, commits, 'commit inventory');
  verifyRuntimeIdentity(facts);
  commit(facts.commits[facts.base], facts.base);
  const head = commit(facts.commits[facts.head], facts.head);
  const tested = commit(facts.commits[facts.testedMerge], facts.testedMerge);
  const main = commit(facts.commits[facts.returnedMain], facts.returnedMain);
  must(same(tested.parents, [facts.base, facts.head]), 'tested merge parents mismatch');
  must(same(main.parents, [facts.base]), 'returned main parent mismatch');
  must(main.tree === tested.tree, 'returned main tree mismatch');
  must(facts.protectedMain === facts.returnedMain, 'protected main mismatch');
  must(writerDigest(facts.writerPaths) === facts.writerMapSha256, 'writer map mismatch');
  must(facts.terminalDelivery === true, 'terminal delivery missing');
  must(facts.finalIntake === 'clean', 'final intake is not clean');
  must(Array.isArray(facts.lanes) && facts.lanes.length > 0, 'lane identity missing');
  must(
    Array.isArray(facts.requiredContexts) &&
      facts.requiredContexts.length > 0 &&
      facts.requiredContexts.every(context => typeof context === 'string' && context.length > 0) &&
      new Set(facts.requiredContexts).size === facts.requiredContexts.length,
    'required context inventory mismatch'
  );
  must(
    new Set(facts.lanes.map(lane => lane.name)).size === facts.lanes.length,
    'duplicate lane identity'
  );
  for (const lane of facts.lanes) verifyLane(lane, facts, tested.tree, head.tree, requiredApps);
  must(
    same(
      facts.lanes.map(lane => lane.name).sort(alphabetical),
      [...facts.requiredContexts].sort(alphabetical)
    ),
    'required context coverage mismatch'
  );
  return { ok: true, testedTree: tested.tree, returnedMain: facts.returnedMain };
}

export function authorityConsumption({ pullRequestState, terminalFailure }) {
  if (terminalFailure)
    return { consumed: true, successorsBlocked: true, reason: 'terminal_failure' };
  if (['MERGED', 'CLOSED'].includes(pullRequestState)) {
    return { consumed: true, successorsBlocked: false, reason: 'authority_consumed_by_merge' };
  }
  return { consumed: false, successorsBlocked: false, reason: 'active' };
}
