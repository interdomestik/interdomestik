import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ADOPTION_COMMIT,
  ADOPTION_TREE,
  SOURCE_COMMIT,
  SOURCE_TREE,
  git,
  requireCommit,
  rootDir,
  tmp,
} from './db-access-required-git.mjs';

export const AUTHORITY_BRANCH = 'codex/s7-required-tenant-guard-authority';

requireCommit(ADOPTION_COMMIT, 'actual adoption history');
requireCommit(SOURCE_COMMIT, 'approved guard source');
assert.equal(git(rootDir, 'rev-parse', `${ADOPTION_COMMIT}^{tree}`), ADOPTION_TREE);
assert.equal(git(rootDir, 'rev-parse', `${SOURCE_COMMIT}^{tree}`), SOURCE_TREE);

// Actual protected history through alternates; nothing is re-anchored or repacked. With `authority`,
// a branch mirrors the root-published artifact (parents 278e, e113) whose only role is to keep the
// approved source reachable from origin, as on the real repository.
export function actualOrigin(base = ADOPTION_COMMIT, { authority = true } = {}) {
  const origin = tmp('actual-origin');
  git(origin, 'init', '-q', '-b', 'main');
  const common = git(rootDir, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  fs.writeFileSync(
    path.join(origin, '.git/objects/info/alternates'),
    `${path.join(common, 'objects')}\n`
  );
  git(origin, 'update-ref', 'refs/heads/main', base);
  git(origin, 'reset', '-q', '--hard', 'main');
  if (authority) {
    const artifact = git(
      origin,
      'commit-tree',
      ADOPTION_TREE,
      '-p',
      ADOPTION_COMMIT,
      '-p',
      SOURCE_COMMIT,
      '-m',
      'authority artifact'
    );
    git(origin, 'update-ref', `refs/heads/${AUTHORITY_BRANCH}`, artifact);
  }
  return origin;
}
