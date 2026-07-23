import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../../.forgejo/workflows/z620-pre-push.yml', import.meta.url);
const workflow = await readFile(workflowUrl, 'utf8');

test('workflow is manually dispatchable and limited to the ci branch namespace', () => {
  assert.match(workflow, /^\s{2}workflow_dispatch:\s*$/mu);
  assert.match(workflow, /^\s{2}push:\s*\n\s{4}branches:\s*\n\s{6}- 'ci\/\*\*'$/mu);
  assert.doesNotMatch(workflow, /^\s{2}pull_request:/mu);
});

test('workflow uses the isolated runner with cancellation and read-only contents', () => {
  assert.match(workflow, /^\s{4}runs-on: z620-isolated$/mu);
  assert.match(workflow, /^\s{2}cancel-in-progress: true$/mu);
  assert.match(workflow, /^\s{6}contents: read$/mu);
  assert.match(workflow, /group: z620-pre-push-\$\{\{ forgejo\.ref \}\}/u);
});

test('workflow uses the official checkout action and only runs contract tests', () => {
  assert.match(workflow, /https:\/\/data\.forgejo\.org\/actions\/checkout@v6/u);
  assert.match(workflow, /node --test scripts\/ci\/z620-push-permit\.test\.mjs/u);
  assert.doesNotMatch(workflow, /\b(?:deploy|docker push|release|upload|apply)\b/iu);
  assert.doesNotMatch(workflow, /\bsecrets?\./iu);
});
