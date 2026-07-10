import assert from 'node:assert/strict';
import test from 'node:test';
import { createSubmissionController } from '../public/src/app/submission-controller.mjs';
import { buildReceipt } from '../public/src/state/receipt-builder.mjs';
import { createReviewSession } from '../public/src/state/review-session.mjs';
import { bundleWithDescriptors } from './conditional-fixtures.mjs';
import { completeDecision } from './review-session-fixtures.mjs';

test('submission receipt contains only applicable responses after controller changes', async () => {
  const bundle = bundleWithDescriptors();
  const session = createReviewSession(
    bundle,
    {
      decisions: {
        item_a: {
          ...completeDecision,
          responses: {
            medicalBoundary: 'excluded',
            disabledScope: 'Disable medical data.',
            reviewerNote: 'Preserve this.',
          },
        },
      },
    },
    { applySuggestions: false }
  );
  session.setResponse('item_a', 'medicalBoundary', 'allowed');
  session.setResponse('item_a', 'dpiaRef', 'docs/dpia.md');
  const controller = createSubmissionController({
    bundle,
    buildReceipt: input => buildReceipt({ ...input, submittedAt: '2026-07-10T12:00:00.000Z' }),
    receiptStore: { save: async receipt => ({ ok: true, value: receipt }) },
  });

  const result = await controller.submit(session.getSnapshot(), true);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.structuredResponses.item_a, {
    medicalBoundary: 'allowed',
    dpiaRef: 'docs/dpia.md',
    reviewerNote: 'Preserve this.',
  });
});
