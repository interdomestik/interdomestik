import { validateSafeText } from '../validation/input-guards.mjs';

const TEXT_TYPES = new Set(['text', 'textarea']);
const IDENTITY_KEYS = new Set(['ownerDisplayName']);
const isObject = value => value !== null && !Array.isArray(value) && typeof value === 'object';
const fail = message => {
  throw new TypeError(`conditionalResponses ${message}`);
};

export function normalizeConditionalSuggestions(value, descriptors) {
  if (!isObject(value)) fail('must be an object.');
  const entries = Object.entries(value);
  if (entries.length === 0) fail('must not be empty.');
  const byKey = new Map(descriptors.map(descriptor => [descriptor.key, descriptor]));

  return Object.fromEntries(
    entries.map(([key, suggestion]) => {
      const descriptor = byKey.get(key);
      if (!descriptor) fail(`${key} is unknown.`);
      if (!descriptor.requiredWhen) fail(`${key} must be conditional.`);
      if (!TEXT_TYPES.has(descriptor.type)) fail(`${key} must be textual.`);
      if (IDENTITY_KEYS.has(key)) fail(`${key} must not identify a person.`);
      if (typeof suggestion !== 'string' || suggestion.trim() === '') {
        fail(`${key} must be non-empty.`);
      }
      if (!validateSafeText(suggestion, { maxLength: descriptor.maxLength }).ok) {
        fail(`${key} must be repo-safe.`);
      }
      return [key, suggestion];
    })
  );
}
