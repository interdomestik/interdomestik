import assert from 'node:assert/strict';
import test from 'node:test';
import { setDocument } from '../public/src/components/dom.mjs';
import { renderPacketRail } from '../public/src/components/packet-rail.mjs';
import { copy, fakeDocument, walk } from './fake-dom.mjs';
import { bundle } from './review-session-fixtures.mjs';

setDocument(fakeDocument);

test('approve stays incomplete until every item requirement validates', () => {
  const empty = {
    decision: null,
    concreteAnswer: '',
    reason: '',
    evidenceRef: '',
    verifiedAt: '',
    riskCategory: '',
    severity: '',
    requestedChange: '',
    responses: {},
  };
  const state = {
    activeItem: 'item_a',
    decisions: { item_a: empty, item_b: { ...empty, decision: 'approve' } },
  };
  const view = renderPacketRail({ packet: bundle.packet, state });
  const item = walk(view).find(node => node.attributes['data-item-id'] === 'item_b');
  assert.match(copy(item), /Pa filluar/);
  assert.doesNotMatch(copy(item), /Përfunduar/);
});
