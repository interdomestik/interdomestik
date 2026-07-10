import { normalizeDescriptors } from './normalize-descriptor.mjs';

const BASE_FIELDS = [
  'decision',
  'concreteAnswer',
  'reason',
  'evidenceRef',
  'verifiedAt',
  'riskCategory',
  'severity',
  'requestedChange',
];

function requiredString(record, key) {
  if (typeof record?.[key] !== 'string' || record[key] === '') {
    throw new TypeError(`${key} must be a non-empty string.`);
  }
  return record[key];
}

function stringList(value, key, allowEmpty = false) {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.some(entry => typeof entry !== 'string')
  ) {
    throw new TypeError(`${key} must be a ${allowEmpty ? '' : 'non-empty '}string array.`);
  }
  return value;
}

export function normalizeItem(item) {
  for (const key of ['id', 'prompt', 'need', 'repoImpact', 'guidance']) requiredString(item, key);
  const baseFields = stringList(item.baseFields, 'baseFields');
  for (const key of BASE_FIELDS) {
    if (!baseFields.includes(key)) throw new TypeError(`baseFields must include ${key}.`);
  }
  const descriptors = normalizeDescriptors(item.requiredResponses);
  return {
    ...item,
    baseFields: [...baseFields],
    allowedRiskCategories: [...stringList(item.allowedRiskCategories, 'allowedRiskCategories')],
    requiredResponses: descriptors,
  };
}

export function normalizeDecision(decision) {
  for (const key of [
    'itemId',
    'decision',
    'concreteAnswer',
    'reason',
    'evidenceRef',
    'verifiedAt',
  ]) {
    requiredString(decision, key);
  }
  if (
    decision.responses !== undefined &&
    (decision.responses === null ||
      Array.isArray(decision.responses) ||
      typeof decision.responses !== 'object')
  ) {
    throw new TypeError('responses must be an object.');
  }
  return { ...decision, responses: { ...(decision.responses ?? {}) } };
}

export function normalizeDraft(draft) {
  for (const key of [
    'assignmentId',
    'packetId',
    'packetVersion',
    'reviewerFixtureId',
    'editorId',
  ]) {
    requiredString(draft, key);
  }
  if (!Number.isInteger(draft.schemaVersion))
    throw new TypeError('schemaVersion must be an integer.');
  if (
    draft.decisions !== undefined &&
    (draft.decisions === null ||
      Array.isArray(draft.decisions) ||
      typeof draft.decisions !== 'object')
  ) {
    throw new TypeError('decisions must be an object.');
  }
  return { ...draft, decisions: { ...(draft.decisions ?? {}) } };
}
