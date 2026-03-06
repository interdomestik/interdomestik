import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTempRoot,
  programDoc,
  proofRow,
  queueRow,
  runScript,
  trackerDoc,
  writeFile,
} from './plan-test-helpers.mjs';

test('plan-proof prints proof state and evidence presence for tracker items', () => {
  const root = createTempRoot('plan-proof-');

  writeFile(root, 'docs/plans/current-program.md', programDoc('Proof execution.'));
  writeFile(root, 'docs/existing-evidence.md', '# Evidence\n');
  writeFile(
    root,
    'docs/plans/current-tracker.md',
    trackerDoc(
      [queueRow({ status: 'in_progress', work: 'Bind proof.', exitCriteria: 'Evidence exists.' })],
      [
        proofRow({
          sourceRefs: '`maturity:#4`; `bulletproof:A22`',
          execution: 'multi_agent',
          runId: 'run-123',
          runRoot: 'tmp/multi-agent/run-123',
          sonar: 'pass',
          docker: 'pass',
          sentry: 'missing',
          learning: 'pending',
          evidenceRefs: '`docs/existing-evidence.md`; `docs/missing-evidence.md`',
        }),
      ]
    )
  );

  const result = runScript('scripts/plan-proof.mjs', root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PG1 \[in_progress\] Bind proof\./);
  assert.match(result.stdout, /execution: multi_agent \| run: run-123/);
  assert.match(result.stdout, /quality: sonar=pass docker=pass sentry=missing \| learning=pending/);
  assert.match(result.stdout, /evidence present: 1\/2/);
});
