import assert from 'node:assert/strict';
import test from 'node:test';
import { importedReceiptMatchesPacket } from '../public/src/app/receipt-packet-guard.mjs';

const packet = {
  itemIds: ['item_a'],
  items: [
    {
      id: 'item_a',
      baseFields: [
        'decision',
        'concreteAnswer',
        'reason',
        'evidenceRef',
        'verifiedAt',
        'riskCategory',
        'severity',
      ],
      allowedRiskCategories: ['privacy'],
      requiredResponses: [{ key: 'ownerRole', type: 'text', required: true, maxLength: 80 }],
    },
  ],
};

const receipt = {
  decisions: {
    item_a: {
      decision: 'approve',
      concreteAnswer: 'Kufiri është kontrolluar.',
      reason: 'Autoriteti përputhet me paketën.',
      evidenceRef: 'docs/product/evidence.md',
      verifiedAt: '2026-07-11',
      riskCategory: 'privacy',
      severity: 'high',
    },
  },
  structuredResponses: { item_a: { ownerRole: 'Legal / Privacy Authority' } },
};

test('accepts a complete imported receipt that matches the packet contract', () => {
  assert.equal(importedReceiptMatchesPacket(receipt, packet, true), true);
});

test('rejects imported content that is incomplete for the packet contract', () => {
  const incomplete = structuredClone(receipt);
  delete incomplete.structuredResponses.item_a.ownerRole;
  assert.equal(importedReceiptMatchesPacket(incomplete, packet, true), false);
});
