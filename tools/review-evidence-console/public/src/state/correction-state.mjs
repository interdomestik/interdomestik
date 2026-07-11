import { verifyReceipt } from './receipt-builder.mjs';
import { clone, deepFreeze } from './review-session-state.mjs';
import { validatePacket } from '../validation/packet.mjs';
import { validateSafeText } from '../validation/input-guards.mjs';

function exactKeys(record, itemIds) {
  const keys = record && typeof record === 'object' ? Object.keys(record) : [];
  return keys.length === itemIds.length && itemIds.every(itemId => keys.includes(itemId));
}

function metadataMatches(receipt, bundle) {
  return (
    receipt.assignmentId === bundle.assignment.id &&
    receipt.packetId === bundle.packet.id &&
    receipt.packetVersion === bundle.packet.version &&
    receipt.reviewerFixtureId === bundle.reviewer.id &&
    receipt.reviewerRole === bundle.reviewer.role &&
    receipt.packetRole === bundle.packet.reviewerRole
  );
}

export async function prepareCorrection(bundle, state, previousReceipt, metadata, itemFor) {
  const prior = deepFreeze(clone(previousReceipt));
  const verified = await verifyReceipt(prior);
  const itemIds = bundle.packet.itemIds;
  if (
    !verified.ok ||
    !metadataMatches(prior, bundle) ||
    !exactKeys(prior.decisions, itemIds) ||
    !exactKeys(prior.structuredResponses, itemIds)
  ) {
    throw new TypeError('Previous receipt is invalid for this assignment.');
  }
  itemFor(metadata.itemId);
  if (
    ![metadata.reason, metadata.impact].every(
      value =>
        typeof value === 'string' && value.trim() && validateSafeText(value, { maxLength: 1000 }).ok
    )
  ) {
    throw new TypeError('Correction item, reason, and impact are required.');
  }
  const decisions = Object.fromEntries(
    itemIds.map(itemId => [
      itemId,
      {
        ...state.decisions[itemId],
        ...clone(prior.decisions[itemId]),
        responses: clone(prior.structuredResponses[itemId]),
      },
    ])
  );
  if (!validatePacket(bundle.packet, decisions, true).valid) {
    throw new TypeError('Previous receipt contains an incomplete packet review.');
  }
  return {
    ...state,
    activeItem: metadata.itemId,
    decisions,
    correction: {
      previousReceipt: prior,
      itemId: metadata.itemId,
      reason: metadata.reason,
      impact: metadata.impact,
    },
  };
}
