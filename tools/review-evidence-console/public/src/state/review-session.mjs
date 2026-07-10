import { prepareCorrection } from './correction-state.mjs';
import { initializeSuggestedDecisions } from './review-suggestions.mjs';
import { assertField, clone, deepFreeze, initialState, same } from './review-session-state.mjs';
import { ownSessionBundle } from './session-bundle.mjs';
import { validatePacket } from '../validation/packet.mjs';

const DECISIONS = new Set([null, 'approve', 'change', 'block']);

function currentLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createReviewSession(
  bundle,
  draft,
  { onChange, applySuggestions = true, getLocalDate = currentLocalDate } = {}
) {
  const ownedBundle = ownSessionBundle(bundle);
  const initialized = initializeSuggestedDecisions(ownedBundle, draft, {
    applySuggestions,
    getLocalDate,
  });
  let state = initialState(ownedBundle, initialized);
  const items = new Map(ownedBundle.packet.items.map(item => [item.id, item]));

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
    return commit(await prepareCorrection(ownedBundle, state, previousReceipt, metadata, itemFor));
  }

  return {
    getSnapshot: () => state,
    getDecision: itemId => (itemFor(itemId), state.decisions[itemId]),
    selectItem: itemId => (itemFor(itemId), commit({ ...state, activeItem: itemId })),
    setDecision,
    setField,
    setResponse,
    useGuidance: itemId =>
      updateDecision(itemId, current => ({
        ...current,
        concreteAnswer: itemFor(itemId).guidance,
        reason: itemFor(itemId).guidance,
      })),
    validate: safeEvidenceConfirmed =>
      validatePacket(ownedBundle.packet, state.decisions, safeEvidenceConfirmed === true),
    createCorrection,
  };
}
