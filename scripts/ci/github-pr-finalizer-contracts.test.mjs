import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');
const CONTRACT_PATH = 'scripts/ci/pr-delivery-contract.json';

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function escapeRegexLiteral(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, String.raw`\$&`);
}

test('PR finalizer reads the acyclic leaf set from the delivery manifest', () => {
  const finalizer = read('scripts/pr-finalizer.sh');
  const finalizerLib = read('scripts/pr-finalizer-lib.sh');
  const feedbackLib = read('scripts/pr-finalizer-feedback-lib.sh');
  const contract = JSON.parse(read(CONTRACT_PATH));

  for (const { context } of contract.finalizerLeafPrerequisites) {
    assert.doesNotMatch(finalizer, new RegExp('"' + escapeRegexLiteral(context) + '"'));
  }

  assert.ok(contract.finalizerLeafPrerequisites.every(item => item.context !== 'pr-finalizer'));
  assert.ok(contract.finalizerLeafPrerequisites.every(item => item.context !== 'delivery-gate'));
  assert.match(finalizer, /PR_DELIVERY_CONTRACT/);
  assert.match(finalizerLib, /\.finalizerLeafPrerequisites\[\]/);
  assert.match(finalizerLib, /@tsv/);
  assert.match(feedbackLib, /deliveryPrerequisites/);
  assert.match(finalizer, /defer_async_generators/);
  assert.doesNotMatch(finalizer, /require_sonar_clean/);
  assert.match(finalizer, /\$\{max_check_retries\}.*\^\[1-9\]\[0-9\]\*\$/);
  assert.match(finalizer, /invalid PR_FINALIZER_MAX_CHECK_RETRIES value/);
  assert.match(
    finalizer,
    /select\(\(\.name\/\/\.workflow_name\/\/""\)==\$NAME and \.app\.id==\$APP_ID\)/
  );
  assert.match(
    finalizerLib,
    /gh api --paginate "repos\/\$\{repo\}\/pulls\/\$\{current_pr\}\/files\?per_page=100"/
  );
  assert.doesNotMatch(finalizerLib, /gh pr view "\$\{PR_NUMBER\}" --json files/);
  assert.doesNotMatch(finalizerLib, /docs_only_required_checks/);
  assert.doesNotMatch(finalizerLib, /success.*skipped.*neutral/s);
});
