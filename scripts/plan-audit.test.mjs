import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authoritativeDoc,
  createTempRoot,
  inputDoc,
  proofRow,
  queueRow,
  runScript,
  trackerDoc,
  writeFile,
  writeGovernedDocs,
} from './plan-test-helpers.mjs';

function runAudit(root) {
  return runScript('scripts/plan-audit.mjs', root, ['--root', root]);
}

function assertAuditFailure(prefix, configureRoot, expectedPattern) {
  const root = createTempRoot(prefix);
  writeGovernedDocs(root);
  configureRoot(root);

  const result = runAudit(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, expectedPattern);
}

test('passes with one canonical plan, one tracker, one execution log, and governed inputs', () => {
  const root = createTempRoot('plan-audit-pass-');

  writeGovernedDocs(root, {
    tracker: trackerDoc(
      [queueRow()],
      [
        proofRow({
          evidenceRefs: '`docs/plans/current-program.md`; `docs/plans/current-tracker.md`',
        }),
      ],
      { withFrontMatter: true }
    ),
  });
  writeFile(
    root,
    'docs/plans/legacy-plan.md',
    inputDoc(
      'superseded',
      'superseded_by: docs/plans/current-program.md\n',
      '> Status: Superseded by current program.\n\n# Legacy\n\nHistorical only.\n'
    )
  );
  writeFile(
    root,
    'docs/plans/constraint.md',
    inputDoc(
      'active',
      '',
      '> Status: Active supporting input.\n\n# Constraint\n\nNo live queue here.\n'
    )
  );

  const result = runAudit(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /plan:audit passed/);
});

test('fails when multiple active trackers exist', () => {
  assertAuditFailure(
    'plan-audit-duplicate-',
    root => {
      writeFile(
        root,
        'docs/plans/other-tracker.md',
        trackerDoc(
          [
            queueRow({
              id: 'PG2',
              status: 'pending',
              work: 'Ship more policy.',
              exitCriteria: 'Proof exists.',
            }),
          ],
          [
            proofRow({
              id: 'PG2',
              sourceRefs: '`governance:proof`',
              execution: 'pending',
              runId: 'pending',
              runRoot: 'pending',
              sonar: 'pending',
              docker: 'pending',
              sentry: 'pending',
              learning: 'pending',
            }),
          ],
          { withFrontMatter: true }
        )
      );
    },
    /expected exactly 1 active tracker source of truth/
  );
});

test('fails when a superseded doc omits superseded_by', () => {
  assertAuditFailure(
    'plan-audit-superseded-',
    root => {
      writeFile(
        root,
        'docs/plans/legacy.md',
        inputDoc('superseded', '', '> Status: Superseded.\n\n# Legacy\n\nHistorical only.\n')
      );
    },
    /superseded documents must declare a valid superseded_by path/
  );
});

test('fails when an active input doc still claims live execution markers', () => {
  assertAuditFailure(
    'plan-audit-live-marker-',
    root => {
      writeFile(
        root,
        'docs/plans/input.md',
        inputDoc(
          'active',
          '',
          '> Status: Active supporting input.\n\n# Input\n\n## Top 12 Next Actions\n\nShould fail.\n'
        )
      );
    },
    /active input docs may not present live execution markers/
  );
});

test('fails when an active queue item does not have a proof row', () => {
  assertAuditFailure(
    'plan-audit-proof-missing-',
    root => {
      writeFile(
        root,
        'docs/plans/current-tracker.md',
        trackerDoc(
          [
            queueRow({
              status: 'in_progress',
              work: 'Reconcile proof.',
              exitCriteria: 'Proof row exists.',
            }),
          ],
          [],
          { withFrontMatter: true }
        )
      );
    },
    /active queue item PG1 is missing a proof ledger row/
  );
});

test('fails when a completed queue item still carries missing proof statuses', () => {
  assertAuditFailure(
    'plan-audit-proof-completed-',
    root => {
      writeFile(
        root,
        'docs/plans/current-tracker.md',
        trackerDoc(
          [queueRow({ work: 'Ship the proof.', exitCriteria: 'Proof complete.' })],
          [
            proofRow({
              sourceRefs: '`maturity:#4`',
              execution: 'multi_agent',
              runId: 'missing',
              runRoot: 'missing',
              sonar: 'missing',
              docker: 'missing',
              sentry: 'missing',
              learning: 'missing',
            }),
          ],
          { withFrontMatter: true }
        )
      );
    },
    /completed queue item PG1 must not use missing or pending proof values/
  );
});

test('fails when the local current task file does not redirect to canonical status', () => {
  assertAuditFailure(
    'plan-audit-local-task-',
    root => {
      writeFile(
        root,
        '.agent/tasks/current_task.md',
        `---
task_name: legacy
---

# Current Task
`
      );
    },
    /local task file must declare status: superseded/
  );
});
