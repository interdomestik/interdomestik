import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { fetchPullRequestFiles, readPullRequestContext } from './github-pr-files-lib.mjs';
import { createTempRoot, runScript, writeFile } from '../plan-test-helpers.mjs';

test('readPullRequestContext returns PR context from event payload', () => {
  const root = createTempRoot('github-pr-files-context-');
  const eventPath = path.join(root, 'event.json');

  writeFile(
    root,
    'event.json',
    JSON.stringify({
      pull_request: {
        number: 235,
      },
      repository: {
        full_name: 'interdomestik/interdomestik',
      },
    })
  );

  assert.deepEqual(readPullRequestContext(eventPath), {
    pullRequestNumber: 235,
    repositoryFullName: 'interdomestik/interdomestik',
  });
});

test('readPullRequestContext returns null for non pull request events', () => {
  const root = createTempRoot('github-pr-files-non-pr-');
  const eventPath = path.join(root, 'event.json');

  writeFile(
    root,
    'event.json',
    JSON.stringify({
      ref: 'refs/heads/main',
      repository: {
        full_name: 'interdomestik/interdomestik',
      },
    })
  );

  assert.equal(readPullRequestContext(eventPath), null);
});

test('fetchPullRequestFiles paginates GitHub PR files API results', async () => {
  const requests = [];
  const pages = [
    Array.from({ length: 100 }, (_, index) => ({ filename: `docs/file-${index}.md` })),
    [{ filename: 'README.md' }],
  ];

  async function fetchImpl(url, options) {
    requests.push({ url, options });
    const pageNumber = Number(new URL(url).searchParams.get('page'));
    const page = pages[pageNumber - 1] || [];

    return {
      ok: true,
      async json() {
        return page;
      },
    };
  }

  const files = await fetchPullRequestFiles({
    repositoryFullName: 'interdomestik/interdomestik',
    pullRequestNumber: 235,
    token: 'test-token',
    fetchImpl,
  });

  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /page=1$/);
  assert.match(requests[1].url, /page=2$/);
  assert.equal(requests[0].options.headers.authorization, 'Bearer test-token');
  assert.equal(files.length, 101);
  assert.equal(files.at(-1), 'README.md');
});

test('CLI exits cleanly for non pull request events', () => {
  const root = createTempRoot('github-pr-files-cli-');
  const eventPath = path.join(root, 'event.json');

  writeFile(
    root,
    'event.json',
    JSON.stringify({
      ref: 'refs/heads/main',
      repository: {
        full_name: 'interdomestik/interdomestik',
      },
    })
  );

  const result = runScript('scripts/ci/github-pr-files.mjs', root, ['--event-path', eventPath]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});
