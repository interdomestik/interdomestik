import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReceipt } from '../public/src/state/receipt-builder.mjs';
import { createReviewSession } from '../public/src/state/review-session.mjs';
import { createFixtureService } from '../server/fixture-service.mjs';
import { createReceiptService } from '../server/receipts/receipt-service.mjs';
import { createTestReceiptKeyring } from './receipt-key-fixtures.mjs';

const account = Object.freeze({
  id: 'acct_gazmend',
  displayName: 'Gazmend Abazi',
  role: 'governance',
  fixtureId: 'reviewer_governance_mk',
});

async function acceptedLegacy(fixtureService) {
  const loaded = await fixtureService.loadAssignment(account, 'assign_mob03a_part_a');
  assert.equal(loaded.ok, true);
  const session = createReviewSession(loaded.value, undefined, {
    getLocalDate: () => '2026-07-12',
  });
  for (const itemId of loaded.value.packet.itemIds) session.setDecision(itemId, 'approve');
  const decisions = {};
  const structuredResponses = {};
  for (const [itemId, value] of Object.entries(session.getSnapshot().decisions)) {
    const { responses, ...decision } = value;
    decisions[itemId] = decision;
    structuredResponses[itemId] = responses;
  }
  return {
    bundle: loaded.value,
    receipt: await buildReceipt({
      schemaVersion: 1,
      packetId: loaded.value.packet.id,
      packetVersion: loaded.value.packet.version,
      assignmentId: loaded.value.assignment.id,
      reviewerFixtureId: account.fixtureId,
      reviewerDisplayName: account.displayName,
      reviewerRole: account.role,
      packetRole: loaded.value.packet.reviewerRole,
      authorityDisclaimer: 'Console review evidence only; CA+DG remains runtime authority.',
      decisions,
      structuredResponses,
      submittedAt: '2026-07-12T06:40:00.000Z',
    }),
  };
}

test('migrates one explicitly accepted legacy receipt into signed immutable lineage', async () => {
  const fixtureService = createFixtureService();
  const { bundle, receipt } = await acceptedLegacy(fixtureService);
  const service = createReceiptService({
    keyring: await createTestReceiptKeyring(),
    now: () => '2026-07-13T14:00:00.000Z',
    acceptedLegacyReceipts: new Map([[receipt.receiptId, receipt.assignmentId]]),
  });
  const result = await service.migrate(account, bundle, {
    assignmentId: receipt.assignmentId,
    legacyReceipt: receipt,
    migrationConfirmed: true,
  });
  assert.equal(result.ok, true);
  assert.notEqual(result.value.receiptId, receipt.receiptId);
  assert.deepEqual(result.value.decisions, receipt.decisions);
  assert.deepEqual(result.value.migration, {
    sourceReceiptId: receipt.receiptId,
    sourceReceiptVersion: 1,
    sourceSchemaVersion: 1,
    sourceSubmittedAt: receipt.submittedAt,
  });
  assert.equal(result.value.reviewerAccountId, account.id);
  assert.equal(result.value.attestation.algorithm, 'Ed25519');
  assert.equal((await service.verify(result.value)).ok, true);
});

test('migration fails closed without confirmation, allowlist, or exact legacy content', async () => {
  const fixtureService = createFixtureService();
  const { bundle, receipt } = await acceptedLegacy(fixtureService);
  const keyring = await createTestReceiptKeyring();
  const service = createReceiptService({ keyring, acceptedLegacyReceipts: new Map() });
  const input = {
    assignmentId: receipt.assignmentId,
    legacyReceipt: receipt,
    migrationConfirmed: true,
  };
  assert.equal((await service.migrate(account, bundle, input)).code, 'invalid_receipt');
  const accepted = createReceiptService({
    keyring,
    acceptedLegacyReceipts: new Map([[receipt.receiptId, receipt.assignmentId]]),
  });
  assert.equal(
    (await accepted.migrate(account, bundle, { ...input, migrationConfirmed: false })).code,
    'invalid_request'
  );
  const tampered = { ...receipt, reviewerDisplayName: 'Another reviewer' };
  assert.equal(
    (await accepted.migrate(account, bundle, { ...input, legacyReceipt: tampered })).code,
    'invalid_receipt'
  );
});
