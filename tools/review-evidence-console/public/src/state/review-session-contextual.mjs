import { setContextualNote, setContextualNoteActive } from './contextual-note-state.mjs';
import { descriptorIsApplicable } from '../validation/descriptor-required.mjs';
import { pruneInapplicableResponses } from '../validation/prune-inapplicable-responses.mjs';

function recommendation(item, path) {
  return path === 'requestedChange'
    ? item.suggestedReview.requestedChange
    : item.suggestedReview.conditionalResponses?.[path.slice('responses.'.length)];
}

function contextualPath(state, itemId, path) {
  return Object.hasOwn(state.contextualNoteState[itemId], path);
}

export function transitionDecision(state, item, decision) {
  if (!['change', 'block'].includes(decision)) return state;
  const current = state.decisions[item.id].requestedChange;
  if (current.trim() !== '') {
    return {
      ...state,
      contextualNoteState: setContextualNote(
        state.contextualNoteState,
        item.id,
        'requestedChange',
        current,
        { suggestion: recommendation(item, 'requestedChange'), maxLength: 1000 }
      ),
    };
  }
  const result = setContextualNoteActive(
    state.contextualNoteState,
    item.id,
    'requestedChange',
    true,
    { suggestion: recommendation(item, 'requestedChange'), maxLength: 1000 }
  );
  return {
    ...state,
    contextualNoteState: result.noteState,
    decisions: {
      ...state.decisions,
      [item.id]: { ...state.decisions[item.id], requestedChange: result.value },
    },
  };
}

export function transitionField(state, item, field, value) {
  if (field !== 'requestedChange') return state.contextualNoteState;
  return setContextualNote(state.contextualNoteState, item.id, field, value, {
    suggestion: recommendation(item, field),
    maxLength: 1000,
  });
}

export function transitionResponses(state, item, key, value) {
  let noteState = state.contextualNoteState;
  const path = `responses.${key}`;
  const descriptor = item.requiredResponses.find(field => field.key === key);
  if (contextualPath(state, item.id, path)) {
    noteState = setContextualNote(noteState, item.id, path, value, {
      suggestion: recommendation(item, path),
      maxLength: descriptor.maxLength,
    });
  }
  const raw = { ...state.decisions[item.id].responses, [key]: value };
  const responses = pruneInapplicableResponses(item.requiredResponses, raw);
  for (const [conditionalKey, suggestion] of Object.entries(
    item.suggestedReview.conditionalResponses ?? {}
  )) {
    const conditionalPath = `responses.${conditionalKey}`;
    const conditional = item.requiredResponses.find(field => field.key === conditionalKey);
    const active = descriptorIsApplicable(conditional, responses);
    const result = setContextualNoteActive(noteState, item.id, conditionalPath, active, {
      suggestion,
      maxLength: conditional.maxLength,
    });
    noteState = result.noteState;
    if (active) responses[conditionalKey] = result.value;
    else delete responses[conditionalKey];
  }
  return { noteState, responses };
}
