import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const SCRIPT_PATH = path.resolve(process.cwd(), 'scripts/plan-proof.mjs');

function writeFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

test('plan-proof prints proof state and evidence presence for tracker items', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-proof-'));

  writeFile(
    root,
    'docs/plans/current-program.md',
    `# Current Program

## Current Phase

Proof execution.
`
  );

  writeFile(root, 'docs/existing-evidence.md', '# Evidence\n');

  writeFile(
    root,
    'docs/plans/current-tracker.md',
    `# Current Tracker

## Active Queue

| ID | Status | Owner | Work | Exit Criteria |
| --- | --- | --- | --- | --- |
| \`PG1\` | \`in_progress\` | \`platform\` | Bind proof. | Evidence exists. |

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| \`PG1\` | \`maturity:#4\`; \`bulletproof:A22\` | \`multi_agent\` | \`run-123\` | \`tmp/multi-agent/run-123\` | \`pass\` | \`pass\` | \`missing\` | \`pending\` | \`docs/existing-evidence.md\`; \`docs/missing-evidence.md\` |
`
  );

  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PG1 \[in_progress\] Bind proof\./);
  assert.match(result.stdout, /execution: multi_agent \| run: run-123/);
  assert.match(result.stdout, /quality: sonar=pass docker=pass sentry=missing \| learning=pending/);
  assert.match(result.stdout, /evidence present: 1\/2/);
});
