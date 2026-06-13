import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPullRequestFilesUrl, buildRepositoryFileContentUrl } from './github-api-url-lib.mjs';

test('GitHub API URL builder encodes repository, path, and query components', () => {
  const url = buildRepositoryFileContentUrl({
    repositoryFullName: 'interdomestik/interdomestik',
    filePath: 'scripts/ci/package file.json',
    ref: 'feature/ref with spaces',
  });

  assert.equal(
    url,
    'https://api.github.com/repos/interdomestik/interdomestik/contents/scripts/ci/package%20file.json?ref=feature%2Fref+with+spaces'
  );
});

test('GitHub API URL builder rejects invalid repository slugs', () => {
  assert.throws(
    () =>
      buildPullRequestFilesUrl({
        repositoryFullName: 'https://metadata.google.internal/latest',
        pullRequestNumber: 1030,
        page: 1,
        perPage: 100,
      }),
    /repositoryFullName must be an owner\/repo slug/u
  );
});
