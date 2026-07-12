import assert from 'node:assert/strict';

import { renderInbox } from '../public/src/views/inbox.mjs';
import { copy, walk } from './fake-dom.mjs';

const BASE_ROW = {
  id: 'assign_a',
  packetId: 'packet_a',
  firstItemId: 'ITEM-1',
  status: 'in_progress',
  risk: 'high',
  dueDate: '2026-07-15',
  title: 'Rishikimi i autoritetit — Pjesa A',
  purpose: 'Verifiko kufirin.',
  progress: 'Në progres',
};

export const inboxRow = overrides => ({ ...BASE_ROW, ...overrides });
export const submittedReceiptId = 'rec_1234567890abcdef12345678';

export const submittedInbox = onOpenReceipt =>
  renderInbox({
    state: 'populated',
    onOpenReceipt,
    assignments: [
      inboxRow({
        submissionStatus: 'submitted',
        receiptId: submittedReceiptId,
        packetVersion: '7',
        submittedAt: '2026-07-12T10:30:00.000Z',
      }),
    ],
  });

export function primaryAction(view) {
  return walk(view).find(node => node.attributes.class === 'primary-action');
}

export function assertSubmittedCard(view, receiptId) {
  const visible = copy(view);
  assert.match(visible, /Dorëzuar/);
  assert.match(visible, /Versioni i paketës: 7/);
  assert.match(visible, /Dorëzuar më:.*Ora lokale e Shkupit/);
  assert.match(visible, /ID-ja e vërtetimit/);
  assert.match(visible, /Shiko vërtetimin/);
  const audit = walk(view).find(node => node.tagName === 'CODE' && copy(node).trim() === receiptId);
  assert.equal(audit?.tagName, 'CODE');
  assert.equal(audit?.attributes.lang, 'en');
}
