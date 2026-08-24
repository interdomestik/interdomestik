import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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
  assert.match(finalizer, /gh api --paginate --slurp/u);
  assert.match(finalizer, /\{check_runs: \[\.\[\]\.check_runs\[\]\]\}/u);
  assert.doesNotMatch(finalizer, /fetch_check_runs\(\)[\s\S]*?return 0\n\}/u);
  assert.equal(finalizer.match(/fetch_check_runs "\$\{repo\}" "\$\{head_sha\}"/gu)?.length, 3);
  assert.match(feedbackLib, /git remote get-url origin 2>\/dev\/null.*\|\| true/u);
  assert.doesNotMatch(finalizerLib, /gh pr view "\$\{PR_NUMBER\}" --json files/);
  assert.doesNotMatch(finalizerLib, /docs_only_required_checks/);
  assert.doesNotMatch(finalizerLib, /success.*skipped.*neutral/s);
  assert.match(finalizer, /required_records/);
  assert.match(finalizer, /delivery contract has no valid finalizer prerequisites/);
});

test('required-check extraction fails closed for an empty manifest set', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'finalizer-contract-'));
  const contractPath = path.join(temporary, 'contract.json');
  fs.writeFileSync(contractPath, JSON.stringify({ finalizerLeafPrerequisites: [] }));
  try {
    const result = spawnSync(
      'bash',
      [
        '-c',
        'source scripts/pr-finalizer-lib.sh; PR_DELIVERY_CONTRACT="$1"; required_check_records',
        '--',
        contractPath,
      ],
      { cwd: rootDir, encoding: 'utf8' }
    );
    assert.notEqual(result.status, 0);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('shared finalizer event reader accepts only a trusted runner file', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'finalizer-event-'));
  const eventPath = path.join(temporary, 'event.json');
  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 1621 } }));
  try {
    const result = spawnSync(
      'bash',
      [
        '-c',
        'source scripts/pr-finalizer-lib.sh; RUNNER_TEMP="$1" trusted_event_pr_number "$2"',
        '--',
        temporary,
        eventPath,
      ],
      { cwd: rootDir, encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '1621');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
