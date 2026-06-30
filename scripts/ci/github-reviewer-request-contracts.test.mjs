import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('bot reviewer request helper is wired as bot-only current-head automation', () => {
  const packageJson = JSON.parse(read('package.json'));
  const config = JSON.parse(read('.github/reviewer-routing.json'));
  const requestScript = read('scripts/github-request-pr-reviewers.mjs');
  const prTemplate = read('.github/pull_request_template.md');

  assert.equal(
    packageJson.scripts['pr:request-reviewers'],
    'node scripts/github-request-pr-reviewers.mjs'
  );
  assert.deepEqual(config.botReviewers, [
    { id: 'copilot', login: 'copilot-pull-request-reviewer[bot]' },
  ]);
  assert.deepEqual(config.botPrompts.map(prompt => prompt.body), ['@codex review']);
  assert.equal(config.humanReviewers, undefined);
  assert.match(prTemplate, /pnpm pr:request-reviewers -- <PR_NUMBER>/);
  assert.match(requestScript, /interdomestik-reviewer-request:\$\{promptId\}:\$\{headSha\}/);
  assert.match(requestScript, /GH_BINARY_CANDIDATES = \['\/usr\/bin\/gh'/);
  assert.match(requestScript, /resolveGhBinary\(\)/);
  assert.match(requestScript, /buildReviewRequestPlan/);
  assert.match(requestScript, /requested_reviewers/);
  assert.match(requestScript, /reviewers\[\]=/);
  assert.match(requestScript, /gh\(\['pr', 'comment'/);
  assert.doesNotMatch(requestScript, /--add-reviewer/);
});
