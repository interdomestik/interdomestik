import assert from 'node:assert/strict';
import test from 'node:test';

import { setDocument } from '../public/src/components/dom.mjs';
import { loadHistoryRows } from '../public/src/views/history-data.mjs';
import { renderHistory } from '../public/src/views/history.mjs';
import { copy, fakeDocument, walk } from './fake-dom.mjs';

setDocument(fakeDocument);

const bundle = {
  assignment: { id: 'assign_a', titleSq: 'Rishikimi i autoritetit — Pjesa A' },
  reviewer: { id: 'reviewer_governance_mk', role: 'governance' },
  packet: { id: 'packet_a', reviewerRole: 'governance' },
};
const first = {
  receiptId: 'rec_111111111111111111111111',
  assignmentId: 'assign_a',
  packetId: 'packet_a',
  packetVersion: '3',
  reviewerFixtureId: 'reviewer_governance_mk',
  reviewerAccountId: 'acct_gazmend',
  reviewerDisplayName: 'Gazmend Abazi',
  reviewerRole: 'governance',
  packetRole: 'governance',
  receiptVersion: 1,
  submittedAt: '2026-07-12T10:00:00.000Z',
  migration: { sourceReceiptId: 'rec_aaaaaaaaaaaaaaaaaaaaaaaa' },
};
const second = {
  ...first,
  receiptId: 'rec_222222222222222222222222',
  receiptVersion: 2,
  submittedAt: '2026-07-13T10:00:00.000Z',
  previousReceiptId: first.receiptId,
};

test('history keeps submitted versions visible and marks immutable lineage', async () => {
  const repository = {
    loadReviewerProfile: async () => ({
      ok: true,
      value: { id: bundle.reviewer.id, accountId: 'acct_gazmend', role: 'governance' },
    }),
    listAssignments: async () => ({ ok: true, value: [bundle.assignment] }),
    loadAssignmentBundle: async () => ({ ok: true, value: bundle }),
  };
  const result = await loadHistoryRows(repository, {
    listAll: async () => ({ ok: true, value: [first, second] }),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.value.map(row => [row.receiptId, row.historyStatus]),
    [
      [second.receiptId, 'submitted'],
      [first.receiptId, 'superseded'],
    ]
  );
  assert.equal(result.value[1].migration.sourceReceiptId, 'rec_aaaaaaaaaaaaaaaaaaaaaaaa');
});

test('history view exposes receipts, versions, migration, and change navigation', () => {
  const opened = [];
  const changes = [];
  const node = renderHistory({
    state: 'populated',
    rows: [
      { ...second, title: bundle.assignment.titleSq, historyStatus: 'submitted' },
      { ...first, title: bundle.assignment.titleSq, historyStatus: 'superseded' },
    ],
    onOpenReceipt: id => opened.push(id),
    onRequestChange: id => changes.push(id),
  });
  const visible = copy(node);
  assert.match(visible, /Historia e shqyrtimeve/);
  assert.match(visible, /Dorëzuar/);
  assert.match(visible, /Zëvendësuar/);
  assert.match(visible, /Migruar nga vërtetimi/);
  assert.match(visible, /Versioni 2/);
  const buttons = walk(node).filter(entry => entry.tagName === 'BUTTON');
  buttons[0].listeners.click();
  buttons[1].listeners.click();
  assert.deepEqual(opened, [second.receiptId]);
  assert.deepEqual(changes, [second.receiptId]);
});
