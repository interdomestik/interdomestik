import { verifyReceipt } from './receipt-builder.mjs';
import { assertField, clone, deepFreeze, initialState, same } from './review-session-state.mjs';
import { validatePacket } from '../validation/packet.mjs';

const DECISIONS = new Set([null, 'approve', 'change', 'block']);

export function createReviewSession(bundle, draft, { onChange } = {}) {
  let state = initialState(bundle, draft);
  const items = new Map(bundle.packet.items.map(item => [item.id, item]));

  function itemFor(itemId) {
    const item = items.get(itemId);
    if (!item) throw new TypeError('Unknown review item.');
    return item;
  }

  function commit(next) {
    if (same(state, next)) return state;
    state = deepFreeze(next);
    onChange?.(state);
    return state;
  }

  function updateDecision(itemId, transform) {
    itemFor(itemId);
    const decision = transform(clone(state.decisions[itemId]));
    return commit({ ...state, decisions: { ...state.decisions, [itemId]: decision } });
  }

  function setDecision(itemId, decision) {
    if (!DECISIONS.has(decision)) throw new TypeError('Unknown review decision.');
    return updateDecision(itemId, current => ({ ...current, decision }));
  }

  function setField(itemId, field, value) {
    assertField(field);
    return updateDecision(itemId, current => ({ ...current, [field]: clone(value) }));
  }

  function setResponse(itemId, key, value) {
    const item = itemFor(itemId);
    if (!item.requiredResponses.some(descriptor => descriptor.key === key)) {
      throw new TypeError('Unknown structured response field.');
    }
    return updateDecision(itemId, current => ({
      ...current,
      responses: { ...current.responses, [key]: clone(value) },
    }));
  }

  async function createCorrection(previousReceipt, metadata = {}) {
    const verified = await verifyReceipt(previousReceipt);
    const matches =
      verified.ok &&
      previousReceipt.assignmentId === bundle.assignment.id &&
      previousReceipt.packetId === bundle.packet.id &&
      previousReceipt.packetVersion === bundle.packet.version &&
      previousReceipt.reviewerFixtureId === bundle.reviewer.id &&
      previousReceipt.reviewerRole === bundle.reviewer.role &&
      previousReceipt.packetRole === bundle.packet.reviewerRole;
    if (!matches) throw new TypeError('Previous receipt is invalid for this assignment.');
    itemFor(metadata.itemId);
    if (
      ![metadata.reason, metadata.impact].every(value => typeof value === 'string' && value.trim())
    ) {
      throw new TypeError('Correction item, reason, and impact are required.');
    }
    const prior = deepFreeze(clone(previousReceipt));
    const decisions = Object.fromEntries(
      bundle.packet.itemIds.map(itemId => [
        itemId,
        previousReceipt.decisions[itemId]
          ? {
              ...state.decisions[itemId],
              ...clone(previousReceipt.decisions[itemId]),
              responses: clone(previousReceipt.structuredResponses[itemId] ?? {}),
            }
          : state.decisions[itemId],
      ])
    );
    return commit({
      ...state,
      activeItem: metadata.itemId,
      decisions,
      correction: {
        previousReceipt: prior,
        itemId: metadata.itemId,
        reason: metadata.reason,
        impact: metadata.impact,
      },
    });
  }

  return {
    getSnapshot: () => state,
    getDecision: itemId => (itemFor(itemId), state.decisions[itemId]),
    selectItem: itemId => (itemFor(itemId), commit({ ...state, activeItem: itemId })),
    setDecision,
    setField,
    setResponse,
    useGuidance: itemId => setField(itemId, 'concreteAnswer', itemFor(itemId).guidance),
    validate: safeEvidenceConfirmed =>
      validatePacket(bundle.packet, state.decisions, safeEvidenceConfirmed === true),
    createCorrection,
  };
}
