import { descriptorIsApplicable } from '../validation/descriptor-required.mjs';
import { validateEvidenceRef, validateSafeText } from '../validation/input-guards.mjs';
import { normalizeConditionalSuggestions } from './normalize-conditional-suggestions.mjs';

const FIELDS = [
  'concreteAnswer',
  'reason',
  'evidenceRef',
  'riskCategory',
  'severity',
  'requestedChange',
  'responses',
  'useSessionDateFor',
];
const OPTIONAL_FIELDS = ['conditionalResponses'];
const SEVERITIES = ['low', 'medium', 'high'];
const ARRAY_TYPES = new Set(['multi_select', 'checkbox_group']);
const OPTION_TYPES = new Set(['select', 'radio', ...ARRAY_TYPES]);
const isObject = value => value !== null && !Array.isArray(value) && typeof value === 'object';
const fail = message => {
  throw new TypeError(`suggestedReview ${message}`);
};

function exactObject(value, allowed, name) {
  if (!isObject(value)) fail(`${name} must be an object.`);
  const keys = Object.keys(value);
  if (
    allowed.some(key => !keys.includes(key)) ||
    keys.some(key => !allowed.includes(key) && !OPTIONAL_FIELDS.includes(key))
  ) {
    fail(`${name} keys must match the contract.`);
  }
}

function safeText(value, key, maxLength) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${key} must be non-empty.`);
  if (!validateSafeText(value, { maxLength }).ok) fail(`${key} must be repo-safe.`);
  return value;
}

function evidenceRef(value, key, maxLength = 240) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${key} must be non-empty.`);
  if (!validateEvidenceRef(value, { maxLength }).ok) fail(`${key} must be repo-safe.`);
  return value;
}

function responseValue(descriptor, value) {
  const { key, type } = descriptor;
  if (type === 'date') fail(`responses.${key} must use useSessionDateFor.`);
  if (ARRAY_TYPES.has(type)) {
    if (!Array.isArray(value)) fail(`responses.${key} must be a non-empty string array.`);
    const entries = Array.from(value);
    if (entries.length === 0 || entries.some(entry => typeof entry !== 'string')) {
      fail(`responses.${key} must be a non-empty string array.`);
    }
    if (new Set(entries).size !== entries.length) fail(`responses.${key} must be unique.`);
    if (entries.some(entry => !descriptor.options.includes(entry))) {
      fail(`responses.${key} contains an invalid option.`);
    }
    return entries;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`responses.${key} must be a non-empty string.`);
  }
  if (type === 'text' || type === 'textarea') {
    return safeText(value, `responses.${key}`, descriptor.maxLength);
  }
  if (type === 'evidenceRef') return evidenceRef(value, `responses.${key}`, descriptor.maxLength);
  if (OPTION_TYPES.has(type) && !descriptor.options.includes(value)) {
    fail(`responses.${key} contains an invalid option.`);
  }
  return value;
}

function normalizeResponses(value, descriptors) {
  if (!isObject(value)) fail('responses must be an object.');
  const byKey = new Map(descriptors.map(descriptor => [descriptor.key, descriptor]));
  return Object.fromEntries(
    Object.entries(value).map(([key, response]) => {
      const descriptor = byKey.get(key);
      if (!descriptor) fail(`responses.${key} is unknown.`);
      if (!descriptorIsApplicable(descriptor, value)) {
        fail(`responses.${key} is not applicable.`);
      }
      return [key, responseValue(descriptor, response)];
    })
  );
}

function normalizeDates(value, descriptors, responses) {
  if (!Array.isArray(value)) fail('useSessionDateFor must be a string array.');
  const entries = Array.from(value);
  if (entries.some(key => typeof key !== 'string' || key === '')) {
    fail('useSessionDateFor must be a string array.');
  }
  if (new Set(entries).size !== entries.length) fail('useSessionDateFor must be unique.');
  const byKey = new Map(descriptors.map(descriptor => [descriptor.key, descriptor]));
  for (const key of entries) {
    if (key === 'verifiedAt') continue;
    const descriptor = byKey.get(key);
    if (!descriptor || descriptor.type !== 'date') fail(`useSessionDateFor.${key} must be a date.`);
    if (!descriptorIsApplicable(descriptor, responses)) {
      fail(`useSessionDateFor.${key} is not applicable.`);
    }
  }
  return entries;
}

export function normalizeSuggestion(value, { allowedRiskCategories, requiredResponses }) {
  exactObject(value, FIELDS, '');
  const responses = normalizeResponses(value.responses, requiredResponses);
  const riskCategory = safeText(value.riskCategory, 'riskCategory', 80);
  const severity = safeText(value.severity, 'severity', 16);
  if (!allowedRiskCategories.includes(riskCategory)) fail('riskCategory is invalid.');
  if (!SEVERITIES.includes(severity)) fail('severity is invalid.');
  return {
    concreteAnswer: safeText(value.concreteAnswer, 'concreteAnswer', 2000),
    reason: safeText(value.reason, 'reason', 2000),
    evidenceRef: evidenceRef(value.evidenceRef, 'evidenceRef'),
    riskCategory,
    severity,
    requestedChange: safeText(value.requestedChange, 'requestedChange', 2000),
    ...(value.conditionalResponses === undefined
      ? {}
      : {
          conditionalResponses: normalizeConditionalSuggestions(
            value.conditionalResponses,
            requiredResponses
          ),
        }),
    responses,
    useSessionDateFor: normalizeDates(value.useSessionDateFor, requiredResponses, responses),
  };
}
