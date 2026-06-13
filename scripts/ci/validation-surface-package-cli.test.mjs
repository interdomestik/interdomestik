import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { runScriptAsync } from './run-script-async-test-helper.mjs';
import { createTempRoot, writeFile } from '../plan-test-helpers.mjs';

test('CLI resolves safe package.json changes from GitHub contents', async () => {
  const root = createTempRoot('validation-surface-package-cli-');
  const eventPath = path.join(root, 'event.json');
  const changedFilesPath = path.join(root, 'changed-files.txt');
  const fixturesPath = path.join(root, 'fixtures');
  const beforeContent = JSON.stringify({ scripts: { check: 'pnpm lint' } });
  const afterContent = JSON.stringify({
    scripts: { check: 'pnpm lint', 'docker:reclaim': 'bash scripts/docker-reclaim.sh light' },
  });

  writeFile(root, 'changed-files.txt', 'package.json\nscripts/docker-reclaim.sh\n');
  writeFile(root, 'fixtures/base-ref/package.json', beforeContent);
  writeFile(root, 'fixtures/head-ref/package.json', afterContent);
  writeFile(
    root,
    'event.json',
    JSON.stringify({
      pull_request: { base: { sha: 'base-ref' }, head: { sha: 'head-ref' } },
      repository: { full_name: 'interdomestik/interdomestik' },
    })
  );

  const result = await runScriptAsync(
    'scripts/ci/validation-surface-policy.mjs',
    root,
    [
      '--event-name',
      'pull_request',
      '--event-path',
      eventPath,
      '--changed-files-path',
      changedFilesPath,
    ],
    { env: { GH_TOKEN: 'test-token', GITHUB_PACKAGE_JSON_FIXTURE_DIR: fixturesPath } }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^should_run=false$/m);
  assert.match(result.stdout, /^reason=non_product_only_pr$/m);
  assert.match(
    result.stdout,
    /non_product_only_paths=\["package\.json","scripts\/docker-reclaim\.sh"\]/
  );
});
