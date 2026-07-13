import assert from 'node:assert/strict';
import test from 'node:test';

import { buildServerCorrection } from '../server/receipts/receipt-envelope.mjs';

const account = Object.freeze({
  id: 'acct_test',
  fixtureId: 'reviewer_test',
  displayName: 'Test Reviewer',
  role: 'privacy',
});
const bundle = Object.freeze({
  assignment: { id: 'assign_test' },
  packet: { id: 'packet_test', version: '1', reviewerRole: 'privacy', itemIds: ['item_a'] },
});
const submission = Object.freeze({
  assignmentId: 'assign_test',
  correctionImpact: 'Ndikim i sigurt',
  correctionItemId: 'item_a',
  correctionReason: 'Arsye e sigurt',
  decisions: {},
  previousReceipt: {},
  safeEvidenceConfirmed: true,
  structuredResponses: {},
});

test('server rejects unsafe correction metadata before judgment validation or signing', async () => {
  const unsafe = [
    { ...submission, safeEvidenceConfirmed: false },
    { ...submission, correctionReason: 'arsye\u0000e pasigurt' },
    { ...submission, correctionImpact: 'https://private.example/evidence' },
    { ...submission, correctionReason: 'x'.repeat(1001) },
  ];
  for (const candidate of unsafe) {
    await assert.rejects(
      () => buildServerCorrection(account, bundle, candidate, {}, { now: () => '' }),
      /invalid receipt correction/i
    );
  }
});
