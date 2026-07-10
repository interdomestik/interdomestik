import assert from 'node:assert/strict';
import test from 'node:test';
import { setDocument } from '../public/src/components/dom.mjs';
import { renderPacketRail } from '../public/src/components/packet-rail.mjs';
import { createFixtureRepository } from '../public/src/data/fixture-repository.mjs';
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

test('renders each Albanian packet title and every packet-specific stop condition', async () => {
  const repository = createFixtureRepository();
  for (const assignmentId of ['assign_mob03a_part_a', 'assign_mob03a_part_b']) {
    const loaded = await repository.loadAssignmentBundle(assignmentId);
    const packet = loaded.value.packet;
    const view = renderPacketRail({
      packet,
      state: { activeItem: packet.itemIds[0], decisions: {} },
    });
    const content = copy(view);
    assert.ok(content.includes(packet.title));
    for (const stopCondition of packet.stopConditions) {
      assert.ok(content.includes(stopCondition), `${packet.id} omitted: ${stopCondition}`);
    }
  }
});
