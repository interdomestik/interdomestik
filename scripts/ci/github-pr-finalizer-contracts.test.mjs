import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');
const REQUIRED_CHECKS = [
  'validation-surface',
  'audit',
  'e2e',
  'pnpm-audit',
  'gitleaks',
  'pilot-gate',
  'commitlint',
  'CodeQL',
  'Analyze (actions)',
  'Analyze (javascript-typescript)',
];

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function escapeRegexLiteral(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, String.raw`\$&`);
}

test('PR finalizer local polling covers current deterministic required checks', () => {
  const finalizer = read('scripts/pr-finalizer.sh');
  const finalizerLib = read('scripts/pr-finalizer-lib.sh');

  for (const checkName of REQUIRED_CHECKS) {
    assert.match(finalizer, new RegExp(`"${escapeRegexLiteral(checkName)}"`));
  }

  assert.match(finalizer, /\[\[ "\$\{check_name\}" == "pr-finalizer" \]\]/);
  assert.match(finalizer, /\(\.name \/\/ \.workflow_name \/\/ ""\) == \$NAME/);
  assert.match(
    finalizerLib,
    /gh api --paginate "repos\/\$\{repo\}\/pulls\/\$\{current_pr\}\/files\?per_page=100"/
  );
  assert.doesNotMatch(finalizerLib, /gh pr view "\$\{PR_NUMBER\}" --json files/);
  assert.doesNotMatch(finalizerLib, /docs_only_required_checks/);
});
