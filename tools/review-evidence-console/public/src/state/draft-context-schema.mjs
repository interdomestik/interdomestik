import { assertContextualText } from './contextual-note-validation.mjs';

const STATUSES = new Set(['unseen', 'suggested', 'custom', 'dismissed']);

export function createDraftContextSchema(packet) {
  if (!Array.isArray(packet?.items) || !Array.isArray(packet?.itemIds)) {
    throw new TypeError('Validated packet is required for draft context.');
  }
  const items = Object.fromEntries(
    packet.items.map(item => {
      const limits = new Map(item.requiredResponses.map(field => [field.key, field.maxLength]));
      const fields = { requestedChange: 1000 };
      for (const key of Object.keys(item.suggestedReview?.conditionalResponses ?? {})) {
        if (!limits.has(key)) throw new TypeError('Unknown conditional response path.');
        fields[`responses.${key}`] = limits.get(key);
      }
      return [item.id, Object.freeze(fields)];
    })
  );
  if (new Set(packet.itemIds).size !== packet.itemIds.length) {
    throw new TypeError('Packet item identities must be unique.');
  }
  if (Object.keys(items).length !== packet.itemIds.length) {
    throw new TypeError('Packet item identities are inconsistent.');
  }
  for (const id of packet.itemIds) if (!Object.hasOwn(items, id)) throw new TypeError('Unknown item.');
  return Object.freeze({ items: Object.freeze(items) });
}

function validNote(note, maxLength) {
  if (!note || typeof note !== 'object' || Array.isArray(note) || !STATUSES.has(note.status)) {
    return false;
  }
  const keys = Object.keys(note);
  if (note.status !== 'custom') return keys.length === 1;
  if (keys.length !== 2 || typeof note.value !== 'string' || !note.value.trim()) return false;
  try {
    assertContextualText(note.value, maxLength);
    return true;
  } catch {
    return false;
  }
}

export function validateDraftContext(state, schema) {
  if (!schema?.items || !state || typeof state !== 'object' || Array.isArray(state)) return false;
  const itemIds = Object.keys(schema.items);
  if (Object.keys(state).length !== itemIds.length) return false;
  return itemIds.every(itemId => {
    const record = state[itemId];
    const fields = schema.items[itemId];
    if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
    const paths = Object.keys(fields);
    return (
      Object.keys(record).length === paths.length &&
      paths.every(path => validNote(record[path], fields[path]))
    );
  });
}
