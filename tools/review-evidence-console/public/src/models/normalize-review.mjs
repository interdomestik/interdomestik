const BASE_FIELDS = ['decision', 'concreteAnswer', 'reason', 'evidenceRef', 'verifiedAt'];

function required(record, key) {
  if (record?.[key] === undefined || record[key] === null || record[key] === '') {
    throw new TypeError(`${key} is required.`);
  }
  return record[key];
}

function textList(value, key) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some(entry => typeof entry !== 'string')
  ) {
    throw new TypeError(`${key} must be a non-empty string array.`);
  }
  return value;
}

function normalizeDescriptor(descriptor) {
  const value = required(descriptor, 'key');
  required(descriptor, 'labelSq');
  required(descriptor, 'type');
  if (typeof descriptor.required !== 'boolean') throw new TypeError('required must be boolean.');
  if (!Number.isInteger(descriptor.maxLength) || descriptor.maxLength < 1) {
    throw new TypeError('maxLength must be a positive integer.');
  }
  if (!Array.isArray(descriptor.options)) throw new TypeError('options must be an array.');
  if (descriptor.requiredWhen !== undefined && typeof descriptor.requiredWhen !== 'object') {
    throw new TypeError('requiredWhen must be an object.');
  }
  return { ...descriptor, key: value };
}

export function normalizeItem(item) {
  for (const key of ['id', 'prompt', 'need', 'repoImpact', 'guidance']) required(item, key);
  const baseFields = textList(item.baseFields, 'baseFields');
  for (const key of BASE_FIELDS) {
    if (!baseFields.includes(key)) throw new TypeError(`baseFields must include ${key}.`);
  }
  if (!Array.isArray(item.requiredResponses) || item.requiredResponses.length === 0) {
    throw new TypeError('requiredResponses must be a non-empty array.');
  }
  const descriptors = item.requiredResponses.map(normalizeDescriptor);
  if (new Set(descriptors.map(entry => entry.key)).size !== descriptors.length) {
    throw new TypeError('requiredResponses keys must be unique.');
  }
  return {
    ...item,
    baseFields: [...baseFields],
    allowedRiskCategories: [...textList(item.allowedRiskCategories, 'allowedRiskCategories')],
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
    required(decision, key);
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
    required(draft, key);
  }
  if (!Number.isInteger(draft.schemaVersion))
    throw new TypeError('schemaVersion must be an integer.');
  return { ...draft, decisions: { ...(draft.decisions ?? {}) } };
}
