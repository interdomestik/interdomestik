import { validateSafeText } from '../validation/input-guards.mjs';

export function assertContextualText(value, maxLength) {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    !validateSafeText(value, { maxLength }).ok
  ) {
    throw new TypeError('Invalid contextual safe-text length or content.');
  }
}
