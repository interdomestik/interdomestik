import { validateSafeText } from '../validation/input-guards.mjs';

const STATUSES = new Set(['unseen', 'suggested', 'custom', 'dismissed']);

export function assertContextualText(value, maxLength) {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    !validateSafeText(value, { maxLength }).ok
  ) {
    throw new TypeError('Invalid contextual safe-text length or content.');
  }
}

export function assertContextualNote(note, maxLength) {
  if (!note || typeof note !== 'object' || Array.isArray(note) || !STATUSES.has(note.status)) {
    throw new TypeError('Invalid contextual note state.');
  }
  const keys = Object.keys(note);
  if (note.status !== 'custom') {
    if (keys.length !== 1) throw new TypeError('Invalid contextual note tombstone.');
    return;
  }
  if (keys.length !== 2) throw new TypeError('Invalid contextual custom note state.');
  assertContextualText(note.value, maxLength);
}

export function isValidContextualNote(note, maxLength) {
  try {
    assertContextualNote(note, maxLength);
    return true;
  } catch {
    return false;
  }
}
