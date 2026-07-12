import assert from 'node:assert/strict';
import test from 'node:test';

import { setDocument } from '../public/src/components/dom.mjs';
import * as statusModule from '../public/src/views/inbox-card-status.mjs';
import { renderInbox } from '../public/src/views/inbox.mjs';
import { fakeDocument, walk } from './fake-dom.mjs';
import { inboxRow } from './inbox-view-fixtures.mjs';

setDocument(fakeDocument);

test('same-packet controls include packet and assignment IDs in unique accessible names', () => {
  const view = renderInbox({
    state: 'populated',
    assignments: [
      inboxRow({ id: 'assign_a', packetId: 'packet_shared' }),
      inboxRow({ id: 'assign_b', packetId: 'packet_shared' }),
    ],
  });
  const buttons = walk(view).filter(node => node.attributes.class === 'primary-action');
  const files = walk(view).filter(node => node.attributes.type === 'file');
  assert.deepEqual(
    buttons.map(node => node.attributes['aria-label']),
    ['Vazhdo paketën — packet_shared — assign_a', 'Vazhdo paketën — packet_shared — assign_b']
  );
  assert.deepEqual(
    files.map(node => node.attributes['aria-label']),
    [
      'Importo vërtetimin lokal JSON — packet_shared — assign_a',
      'Importo vërtetimin lokal JSON — packet_shared — assign_b',
    ]
  );
  assert.deepEqual(
    buttons.map(node => node.childNodes[0].textContent),
    ['Vazhdo paketën', 'Vazhdo paketën']
  );
});

test('submitted time preserves ISO and follows Skopje summer and winter local time', () => {
  assert.equal(typeof statusModule.formatSubmittedAt, 'function');
  const formatted = statusModule.formatSubmittedAt('2026-07-12T10:30:00.000Z', {
    format: value => `SQ:${value.toISOString()}`,
  });
  assert.equal(formatted, 'SQ:2026-07-12T10:30:00.000Z');
  assert.match(statusModule.formatSubmittedAt('2026-07-12T10:30:00.000Z'), /12:30/);
  assert.match(statusModule.formatSubmittedAt('2026-01-12T10:30:00.000Z'), /11:30/);
  const view = renderInbox({
    state: 'populated',
    assignments: [
      inboxRow({
        submissionStatus: 'submitted',
        receiptId: 'rec_1234567890abcdef12345678',
        packetVersion: '7',
        submittedAt: '2026-07-12T10:30:00.000Z',
      }),
    ],
  });
  const time = walk(view).find(node => node.tagName === 'TIME');
  assert.equal(time?.attributes.datetime, '2026-07-12T10:30:00.000Z');
  assert.match(time?.childNodes[0].textContent ?? '', /Ora lokale e Shkupit/);
  assert.doesNotMatch(time?.childNodes[0].textContent ?? '', /UTC|Evropës Qendrore/);
});
