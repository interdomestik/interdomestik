import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  BOOTSTRAP_BASE,
  ORIGIN,
  SHA40,
  compareCanonicalText,
  promotionArtifactPaths,
} from './lean-current-authority-policy.mjs';

const run = (binary, args, cwd) =>
  execFileSync(binary, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: 30_000,
  }).trim();

export const git = (repo, ...args) => run('/usr/bin/git', args, repo);

export function github(endpoint, repo) {
  const binary = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'].find(existsSync);
  if (!binary) throw new Error('trusted GitHub CLI unavailable');
  return JSON.parse(run(binary, ['api', endpoint], repo));
}

export function commitFacts(repo, sha) {
  const value = github(`repos/${ORIGIN}/git/commits/${sha}`, repo);
  return { parents: value.parents.map(parent => parent.sha), tree: value.tree.sha };
}

export function pullFacts(repo, pull, reviews = [], readCommit = commitFacts) {
  if (!['open', 'closed'].includes(pull.state) || typeof pull.merged !== 'boolean') {
    throw new Error('pull state evidence malformed');
  }
  const head = readCommit(repo, pull.head.sha);
  const merge = pull.merged ? readCommit(repo, pull.merge_commit_sha) : null;
  return {
    number: pull.number,
    state: pull.state.toUpperCase(),
    merged: pull.merged,
    baseSha: pull.base.sha,
    headRef: pull.head.ref,
    headSha: pull.head.sha,
    headTree: head.tree,
    mergeSha: pull.merge_commit_sha,
    mergeParents: merge?.parents,
    mergeTree: merge?.tree,
    changedFileCount: pull.changed_files,
    reviews,
  };
}

export function selectFullProductPull(summaries, readPull) {
  if (!Array.isArray(summaries)) throw new Error('downstream PR inventory malformed');
  if (summaries.length > 1) throw new Error('multiple downstream PRs found');
  return summaries[0] ? readPull(summaries[0].number) : null;
}

export function isCanonicalOrigin(value) {
  return /^(?:https:\/\/github\.com\/|git@github\.com:)interdomestik\/interdomestik(?:\.git)?$/u.test(
    value
  );
}

export const isBootstrapAnchor = sha => sha === BOOTSTRAP_BASE;
export const isClosedUnmergedPull = pull => pull?.state === 'closed' && pull.merged === false;

export function validateRepositoryIdentity(repo) {
  const top = realpathSync(git(repo, 'rev-parse', '--show-toplevel'));
  const common = realpathSync(git(repo, 'rev-parse', '--path-format=absolute', '--git-common-dir'));
  if (top !== realpathSync(repo) || !isCanonicalOrigin(git(repo, 'remote', 'get-url', 'origin'))) {
    throw new Error('canonical repository identity mismatch');
  }
  if (!existsSync(resolve(common, 'HEAD')) || !existsSync(resolve(common, 'objects'))) {
    throw new Error('trusted Git common directory unavailable');
  }
}

export function changedPaths(repo, base) {
  const paths = new Set(git(repo, 'diff', '--name-only', base).split('\n').filter(Boolean));
  const untracked = git(repo, 'ls-files', '--others', '--exclude-standard')
    .split('\n')
    .filter(Boolean);
  for (const path of untracked) paths.add(path);
  return [...paths].sort(compareCanonicalText);
}

export const isAncestor = (repo, ancestor, descendant) =>
  git(repo, 'merge-base', ancestor, descendant) === ancestor;

export function changedPathsBetween(repo, base, head, paths) {
  return git(repo, 'diff', '--name-only', base, head, '--', ...paths)
    .split('\n')
    .filter(Boolean)
    .sort(compareCanonicalText);
}

function artifactSha256(repo, path, treeSha, readGithub) {
  const tree = readGithub(`repos/${ORIGIN}/git/trees/${treeSha}?recursive=1`, repo);
  if (tree?.truncated !== false || !Array.isArray(tree.tree)) {
    throw new Error('promotion tree evidence incomplete');
  }
  const entries = tree.tree.filter(entry => entry?.path === path);
  const entry = entries.length === 1 ? entries[0] : null;
  if (entry?.type !== 'blob' || entry?.mode !== '100644' || !SHA40.test(entry?.sha || '')) {
    throw new Error('promotion artifact must be one regular blob');
  }
  const value = readGithub(`repos/${ORIGIN}/git/blobs/${entry.sha}`, repo);
  const base64 = typeof value?.content === 'string' ? value.content.replace(/\s/gu, '') : '';
  if (
    value?.sha !== entry.sha ||
    value?.encoding !== 'base64' ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(base64) ||
    base64.length % 4 !== 0
  ) {
    throw new Error('promotion artifact evidence malformed');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > 128 * 1024) throw new Error('promotion artifact exceeds size contract');
  return createHash('sha256').update(bytes).digest('hex');
}

export function pullByBranch(repo, branch) {
  const endpoint = `repos/${ORIGIN}/pulls?state=all&base=main&head=interdomestik:${branch}&per_page=10`;
  const summaries = github(endpoint, repo);
  return selectFullProductPull(summaries, number =>
    github(`repos/${ORIGIN}/pulls/${number}`, repo)
  );
}

export function attachPullFiles(repo, pull, readGithub = github) {
  pull.changedPaths = readGithub(
    `repos/${ORIGIN}/pulls/${pull.number}/files?per_page=100`,
    repo
  ).map(file => file.filename);
  pull.inventoryComplete = pull.changedPaths.length === pull.changedFileCount;
  return pull;
}

export const protectedMain = (repo, supplied) =>
  supplied ?? github(`repos/${ORIGIN}/git/ref/heads/main`, repo).object.sha;

export function collectPromotionFacts(repo, slice, readGithub = github, readCommit = commitFacts) {
  const pull = readGithub(`repos/${ORIGIN}/pulls/${slice.promotionPrNumber}`, repo);
  if (isClosedUnmergedPull(pull)) return { state: 'CLOSED', merged: false };
  const rawReviews = readGithub(
    `repos/${ORIGIN}/pulls/${slice.promotionPrNumber}/reviews?per_page=100`,
    repo
  );
  if (rawReviews.length >= 100)
    throw new Error('promotion review inventory pagination ceiling reached');
  const reviews = rawReviews.map(review => ({
    state: review.state,
    body: review.body ?? '',
    commitId: review.commit_id,
    user: { login: review.user.login, id: review.user.id },
  }));
  const result = attachPullFiles(repo, pullFacts(repo, pull, reviews, readCommit), readGithub);
  const artifacts = promotionArtifactPaths(result.changedPaths);
  if (artifacts) {
    result.gateSha256 = artifactSha256(repo, artifacts.gate, result.headTree, readGithub);
    result.admissionSha256 = artifactSha256(repo, artifacts.admission, result.headTree, readGithub);
  }
  return result;
}
