import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSafeOperation, runSafeOperation } from './slice-rehearse-ops.mjs';

const head = 'a'.repeat(40);

test('builds copy-safe PR, label, feedback, and telemetry argv without a shell', () => {
  assert.deepEqual(
    buildSafeOperation({
      operation: 'pr_create',
      approvalEnvelopeId: 'HARNESS-V2-1-DELIVERY-1',
      expectedHeadSha: head,
      branch: 'codex/harness-v2-1',
      baseBranch: 'main',
      title: 'feat: harness v2.1',
      bodyFile: '/private/tmp/harness-v2-1-pr.md',
    }),
    {
      binary: 'gh',
      args: [
        'pr',
        'create',
        '--head',
        'codex/harness-v2-1',
        '--base',
        'main',
        '--title',
        'feat: harness v2.1',
        '--body-file',
        '/private/tmp/harness-v2-1-pr.md',
      ],
      mutating: true,
    }
  );
  assert.deepEqual(
    buildSafeOperation({
      operation: 'label_add',
      approvalEnvelopeId: 'HARNESS-V2-1-DELIVERY-1',
      expectedHeadSha: head,
      prNumber: 1700,
      label: 'full-gate',
    }).args,
    ['pr', 'edit', '1700', '--add-label', 'full-gate']
  );
  assert.deepEqual(
    buildSafeOperation({
      operation: 'feedback_comment',
      approvalEnvelopeId: 'HARNESS-V2-1-DELIVERY-1',
      expectedHeadSha: head,
      prNumber: 1700,
      bodyFile: '/private/tmp/feedback.md',
    }).args,
    ['pr', 'comment', '1700', '--body-file', '/private/tmp/feedback.md']
  );
  assert.deepEqual(
    buildSafeOperation({
      operation: 'telemetry_summarize',
      inputPath: '/private/tmp/events.jsonl',
    }),
    {
      binary: process.execPath,
      args: ['scripts/slice-telemetry-v2.mjs', '--input', '/private/tmp/events.jsonl'],
      mutating: false,
    }
  );
  assert.deepEqual(
    buildSafeOperation({
      operation: 'telemetry_record',
      eventPath: '/private/tmp/event.json',
      ledgerPath: '/private/tmp/events.jsonl',
    }),
    {
      binary: process.execPath,
      args: [
        'scripts/slice-telemetry-v2-record.mjs',
        '--event',
        '/private/tmp/event.json',
        '--ledger',
        '/private/tmp/events.jsonl',
      ],
      mutating: false,
    }
  );
});

test('checks exact head before mutation and reconciles a failed writer once', () => {
  const request = {
    operation: 'label_add',
    approvalEnvelopeId: 'HARNESS-V2-1-DELIVERY-1',
    expectedHeadSha: head,
    prNumber: 1700,
    label: 'full-gate',
  };
  assert.throws(
    () =>
      runSafeOperation(request, {
        readHead: () => 'b'.repeat(40),
        readPrHead: () => head,
        execute: () => ({ status: 0 }),
      }),
    /exact local head differs/u
  );
  let reconciliations = 0;
  const result = runSafeOperation(request, {
    readHead: () => head,
    readPrHead: () => head,
    execute: () => ({ status: 1, stderr: 'network failure' }),
    reconcile: () => {
      reconciliations += 1;
      return { applied: false, remoteHeadSha: head };
    },
  });
  assert.equal(result.status, 'failed_reconciled');
  assert.equal(reconciliations, 1);
});

test('rejects shell-shaped or under-specified writer requests', () => {
  assert.throws(
    () =>
      buildSafeOperation({
        operation: 'label_add',
        approvalEnvelopeId: 'x',
        expectedHeadSha: head,
        prNumber: 1,
        label: 'full-gate; rm -rf x',
      }),
    /label|envelope/u
  );
  assert.throws(
    () =>
      buildSafeOperation({
        operation: 'feedback_comment',
        approvalEnvelopeId: 'HARNESS-V2-1-DELIVERY-1',
        expectedHeadSha: head,
        prNumber: 1,
      }),
    /keys|body/u
  );
});
