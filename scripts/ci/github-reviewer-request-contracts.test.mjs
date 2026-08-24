import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const config = JSON.parse(read('.github/reviewer-routing.json'));
const [request, template, protection] = [
  'scripts/github-request-pr-reviewers.mjs',
  '.github/pull_request_template.md',
  'docs/BRANCH_PROTECTION_MULTI_AGENT.md',
].map(read);
const delivery = JSON.parse(read('scripts/ci/pr-delivery-contract.json'));
const matches = (value, patterns) => patterns.forEach(pattern => assert.match(value, pattern));

test('reviewer policy is current-head, allowlisted, and Copilot-request free', () => {
  assert.equal(
    JSON.parse(read('package.json')).scripts['pr:request-reviewers'],
    'node scripts/github-request-pr-reviewers.mjs'
  );
  assert.deepEqual(config, { botPrompts: [{ id: 'codex', body: '@codex review' }] });
  matches(request, [
    /interdomestik-reviewer-request:\$\{promptId\}:\$\{headSha\}/u,
    /GH_BINARY_CANDIDATES = \['\/usr\/bin\/gh'/u,
    /assertCurrentHead\(observed, pr\)/u,
    /assertCurrentHead\(pr, confirmed\)/u,
    /--paginate/u,
    /--slurp/u,
    /gh\(\['pr', 'comment'/u,
  ]);
  assert.doesNotMatch(request, /copilot|requested_reviewers|--add-reviewer|--force/iu);
  assert.doesNotMatch(request, /--config/u);
  assert.doesNotMatch(template, /@copilot review|Requested current-head Copilot/u);
  assert.match(template, /Unsolicited Copilot/u);
  assert.match(protection, /never requested or waited on/u);
  assert.ok(delivery.feedbackAuthors.includes('copilot-pull-request-reviewer'));
  assert.ok(delivery.actionableFeedbackPatterns.some(value => value.includes('Previously missed')));
});

test('delivery-gate is the additive terminal protection tuple', () => {
  matches(protection, [/`delivery-gate`/u, /app[_ ]id[^\n]*15368/iu, /add-only/u]);
  assert.match(template, /`delivery-gate`/u);
});
