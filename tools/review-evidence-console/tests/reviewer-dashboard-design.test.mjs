import assert from 'node:assert/strict';
import test from 'node:test';

import { setDocument } from '../public/src/components/dom.mjs';
import { renderInbox } from '../public/src/views/inbox.mjs';
import { copy, fakeDocument, walk } from './fake-dom.mjs';
import { inboxRow } from './inbox-view-fixtures.mjs';

setDocument(fakeDocument);

test('reviewer dashboard presents work summary and keeps migration secondary', () => {
  const node = renderInbox({
    state: 'populated',
    assignments: [
      inboxRow({
        id: 'assign_a',
        submissionStatus: 'submitted',
        receiptId: 'rec_111111111111111111111111',
        packetVersion: '3',
        submittedAt: '2026-07-12T10:00:00.000Z',
      }),
      inboxRow({ id: 'assign_b', submissionStatus: 'not_started' }),
    ],
  });
  const visible = copy(node);
  assert.match(visible, /1\s+Në punë/);
  assert.match(visible, /1\s+Dorëzuar/);
  assert.match(visible, /Ruajtje lokale/);
  assert.match(visible, /Kam një vërtetim të përfunduar/);
  const details = walk(node).filter(entry => entry.tagName === 'DETAILS');
  assert.equal(details.length, 2);
  const cards = walk(node).filter(entry => entry.attributes.class?.includes('assignment-card'));
  assert.equal(cards.length, 2);
});
