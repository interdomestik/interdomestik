import assert from 'node:assert/strict';
import test from 'node:test';
import { copy, fakeDocument, walk } from './fake-dom.mjs';
import { setDocument } from '../public/src/components/dom.mjs';
import { renderInbox } from '../public/src/views/inbox.mjs';

setDocument(fakeDocument);

test('discloses local-only import before selection and associates its help', () => {
  const node = renderInbox({
    state: 'populated',
    assignments: [
      {
        id: 'assign_a',
        packetId: 'packet_a',
        status: 'in_progress',
        risk: 'high',
        dueDate: '2026-07-15',
        title: 'Packet A',
        purpose: 'Review.',
        progress: 'In progress',
      },
    ],
  });
  assert.match(copy(node), /Read on this device; never uploaded/);
  const input = walk(node).find(entry => entry.tagName === 'INPUT');
  assert.equal(input.attributes['aria-describedby'], 'import-help-assign_a');
  assert.equal(input.attributes.accept, 'application/json,.json');
});
