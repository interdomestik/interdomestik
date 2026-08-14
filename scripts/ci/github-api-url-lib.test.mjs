import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCommitPullRequestsUrl,
  buildCommitUrl,
  buildPullRequestFilesUrl,
  buildRepositoryFileContentUrl,
  buildRunJobsUrl,
  buildWorkflowRunsUrl,
} from './github-api-url-lib.mjs';

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

test('GitHub API URL builder creates bounded exact-tree evidence endpoints', () => {
  const repositoryFullName = 'interdomestik/interdomestik';
  const commitSha = 'b760d2253a1973294613770d09260bea45ddad95';

  assert.equal(
    buildCommitPullRequestsUrl({ repositoryFullName, commitSha, page: 2, perPage: 100 }),
    `https://api.github.com/repos/interdomestik/interdomestik/commits/${commitSha}/pulls?per_page=100&page=2`
  );
  assert.equal(
    buildCommitUrl({ repositoryFullName, commitSha }),
    `https://api.github.com/repos/interdomestik/interdomestik/commits/${commitSha}`
  );
  assert.equal(
    buildWorkflowRunsUrl({
      repositoryFullName,
      workflowPath: '.github/workflows/e2e-pr.yml',
      headSha: commitSha,
      page: 1,
      perPage: 20,
    }),
    `https://api.github.com/repos/interdomestik/interdomestik/actions/workflows/.github%2Fworkflows%2Fe2e-pr.yml/runs?event=pull_request&status=completed&head_sha=${commitSha}&per_page=20&page=1`
  );
  assert.equal(
    buildRunJobsUrl({ repositoryFullName, runId: 31_712_197_425, page: 1, perPage: 100 }),
    'https://api.github.com/repos/interdomestik/interdomestik/actions/runs/31712197425/jobs?per_page=100&page=1'
  );
});

test('GitHub API URL builder rejects unsafe identifiers and pagination', () => {
  const repositoryFullName = 'interdomestik/interdomestik';
  assert.throws(
    () =>
      buildCommitUrl({
        repositoryFullName,
        commitSha: 'main?access_token=secret',
      }),
    /commitSha must be a full commit SHA/u
  );
  assert.throws(
    () =>
      buildWorkflowRunsUrl({
        repositoryFullName,
        workflowPath: '../e2e-pr.yml',
        headSha: 'b760d2253a1973294613770d09260bea45ddad95',
        page: 1,
        perPage: 20,
      }),
    /workflowPath must be a repository-relative path/u
  );
  assert.throws(
    () => buildRunJobsUrl({ repositoryFullName, runId: -1, page: 0, perPage: 101 }),
    /runId must be a positive integer/u
  );
});
