import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReceipt } from '../public/src/state/receipt-builder.mjs';
import { importReceipt } from '../public/src/app/import-controller.mjs';
import { receiptInput } from './state-fixtures.mjs';

async function legacyFile() {
  const receipt = await buildReceipt({
    ...receiptInput,
    submittedAt: '2026-07-12T10:00:00.000Z',
  });
  return {
    receipt,
    file: {
      name: `${receipt.receiptId}.json`,
      size: 1024,
      text: async () => JSON.stringify(receipt),
    },
  };
}

function bundleFor(receipt) {
  return {
    assignment: { id: receipt.assignmentId },
    reviewer: {
      id: receipt.reviewerFixtureId,
      displayName: receipt.reviewerDisplayName,
      role: receipt.reviewerRole,
    },
    packet: {
      id: receipt.packetId,
      version: receipt.packetVersion,
      reviewerRole: receipt.packetRole,
      itemIds: Object.keys(receipt.decisions),
    },
  };
}

test('legacy import requires confirmation then stores only the server-signed migration', async () => {
  const { receipt, file } = await legacyFile();
  const signed = { ...receipt, receiptId: 'rec_aaaaaaaaaaaaaaaaaaaaaaaa', attestation: {} };
  const calls = [];
  const result = await importReceipt({
    assignmentId: receipt.assignmentId,
    file,
    repository: {
      loadAssignmentBundle: async () => ({ ok: true, value: bundleFor(receipt) }),
      migrateReceipt: async input => {
        calls.push(['migrate', input]);
        return signed;
      },
    },
    receiptStore: {
      import: async () => assert.fail('legacy receipt must not enter the signed store'),
      save: async value => {
        calls.push(['save', value]);
        return { ok: true, value };
      },
    },
    confirmMigration: async summary => {
      calls.push(['confirm', summary]);
      return true;
    },
  });
  assert.equal(result.value.receiptId, signed.receiptId);
  assert.equal(calls[0][0], 'confirm');
  assert.equal(calls[0][1].sourceReceiptId, receipt.receiptId);
  assert.deepEqual(calls[1], [
    'migrate',
    { assignmentId: receipt.assignmentId, legacyReceipt: receipt, migrationConfirmed: true },
  ]);
  assert.deepEqual(calls[2], ['save', signed]);
});

test('declining legacy migration leaves the local store unchanged', async () => {
  const { receipt, file } = await legacyFile();
  let calls = 0;
  const result = await importReceipt({
    assignmentId: receipt.assignmentId,
    file,
    repository: {
      loadAssignmentBundle: async () => ({ ok: true, value: bundleFor(receipt) }),
      migrateReceipt: async () => {
        calls += 1;
      },
    },
    receiptStore: { import: async () => {}, save: async () => {} },
    confirmMigration: async () => false,
  });
  assert.equal(result.code, 'migration_cancelled');
  assert.equal(calls, 0);
});
