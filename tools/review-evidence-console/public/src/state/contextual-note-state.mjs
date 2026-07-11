import { assertContextualNote, assertContextualText } from './contextual-note-validation.mjs';

export const SUGGESTION_VERSION = 2;

const clone = value => structuredClone(value);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function trackedFields(item) {
  const limits = new Map(item.requiredResponses.map(field => [field.key, field.maxLength]));
  return [
    ['requestedChange', item.suggestedReview.requestedChange, 1000],
    ...Object.entries(item.suggestedReview.conditionalResponses ?? {}).map(([key, value]) => [
      `responses.${key}`,
      value,
      limits.get(key),
    ]),
  ];
}

function readDecision(draft, itemId) {
  return (draft?.itemDecisions ?? draft?.decisions ?? {})[itemId] ?? {};
}

function readField(decision, path) {
  return path.startsWith('responses.')
    ? decision.responses?.[path.slice('responses.'.length)]
    : decision[path];
}

function migratedNote(value, blanksDismissed, maxLength) {
  if (typeof value === 'string' && value.trim().length > 0) {
    assertContextualText(value, maxLength);
    return { status: 'custom', value };
  }
  return { status: blanksDismissed ? 'dismissed' : 'unseen' };
}

function validateRestored(bundle, state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('Invalid contextual note state.');
  }
  const expectedIds = bundle.packet.itemIds;
  if (Object.keys(state).length !== expectedIds.length) {
    throw new TypeError('Invalid contextual note item identities.');
  }
  for (const item of bundle.packet.items) {
    const record = state[item.id];
    const fields = trackedFields(item);
    if (!record || Object.keys(record).length !== fields.length) {
      throw new TypeError('Invalid contextual note field paths.');
    }
    for (const [field, , maxLength] of fields) assertContextualNote(record[field], maxLength);
  }
  return deepFreeze(clone(state));
}

export function initializeContextualNoteState(bundle, draft) {
  if (!bundle?.packet?.items || !Array.isArray(bundle.packet.itemIds)) {
    throw new TypeError('Review bundle is required for contextual note initialization.');
  }
  const version = draft?.suggestionVersion;
  if (version !== undefined && version !== 1 && version !== SUGGESTION_VERSION) {
    throw new TypeError('Unsupported suggestion version.');
  }
  if (version === SUGGESTION_VERSION) {
    return validateRestored(bundle, draft.contextualNoteState);
  }
  const blanksDismissed = version === 1;
  return deepFreeze(
    Object.fromEntries(
      bundle.packet.items.map(item => {
        const decision = readDecision(draft, item.id);
        return [
          item.id,
          Object.fromEntries(
            trackedFields(item).map(([path, , maxLength]) => [
              path,
              migratedNote(readField(decision, path), blanksDismissed, maxLength),
            ])
          ),
        ];
      })
    )
  );
}

export function setContextualNote(
  state,
  itemId,
  path,
  value,
  { suggestion, maxLength = 2000 } = {}
) {
  if (!state?.[itemId]?.[path]) throw new TypeError('Unknown contextual note field.');
  if (typeof value !== 'string') throw new TypeError('Invalid contextual note text.');
  if (value.trim() !== '') assertContextualText(value, maxLength);
  const next = clone(state);
  next[itemId][path] =
    value.trim() === ''
      ? { status: 'dismissed' }
      : value === suggestion
        ? { status: 'suggested' }
        : { status: 'custom', value };
  return deepFreeze(next);
}

export function setContextualNoteActive(state, itemId, path, active, options = {}) {
  const { suggestion, maxLength = 2000 } = options;
  const note = state?.[itemId]?.[path];
  if (!note) throw new TypeError('Unknown contextual note field.');
  if (active && ['unseen', 'suggested'].includes(note.status)) {
    assertContextualText(suggestion, maxLength);
  }
  const next = clone(state);
  if (active && note.status === 'unseen') next[itemId][path] = { status: 'suggested' };
  const value = !active
    ? undefined
    : note.status === 'custom'
      ? note.value
      : note.status === 'dismissed'
        ? ''
        : suggestion;
  return { noteState: deepFreeze(next), value };
}
