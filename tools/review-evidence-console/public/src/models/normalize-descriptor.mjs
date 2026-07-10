const SUPPORTED_TYPES = Object.freeze([
  'text',
  'textarea',
  'evidenceRef',
  'date',
  'select',
  'radio',
  'multi_select',
  'checkbox_group',
]);
const OPTION_TYPES = new Set(['select', 'radio', 'multi_select', 'checkbox_group']);

function requiredString(record, key) {
  if (typeof record?.[key] !== 'string' || record[key] === '') {
    throw new TypeError(`${key} must be a non-empty string.`);
  }
  return record[key];
}

function normalizeOptions(value, type) {
  if (!Array.isArray(value)) throw new TypeError('options must be an array.');
  if (value.some(option => typeof option !== 'string' || option === '')) {
    throw new TypeError('options must contain non-empty strings.');
  }
  if (OPTION_TYPES.has(type)) {
    if (value.length === 0) throw new TypeError('options must be non-empty.');
    if (new Set(value).size !== value.length) throw new TypeError('options must be unique.');
  } else if (value.length !== 0) {
    throw new TypeError('options must be empty for text, evidence, and date descriptors.');
  }
  return [...value];
}

function normalizeOptionLabels(value, options) {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new TypeError('optionLabelsSq must be an object.');
  }
  const keys = Object.keys(value);
  if (keys.length !== options.length || keys.some(key => !options.includes(key))) {
    throw new TypeError('optionLabelsSq keys must exactly match options.');
  }
  const labels = options.map(option => value[option]);
  if (labels.some(label => typeof label !== 'string' || label.trim() === '')) {
    throw new TypeError('optionLabelsSq must contain non-empty strings.');
  }
  if (new Set(labels).size !== labels.length) {
    throw new TypeError('optionLabelsSq labels must be unique.');
  }
  return Object.fromEntries(options.map((option, index) => [option, labels[index]]));
}

function normalizeRequiredWhen(value) {
  if (value === undefined) return undefined;
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new TypeError('requiredWhen must be an object.');
  }
  return {
    ...value,
    key: requiredString(value, 'key'),
    equals: requiredString(value, 'equals'),
  };
}

function normalizeDescriptor(descriptor) {
  const key = requiredString(descriptor, 'key');
  requiredString(descriptor, 'labelSq');
  const type = requiredString(descriptor, 'type');
  if (!SUPPORTED_TYPES.includes(type)) throw new TypeError('type must be supported.');
  if (typeof descriptor.required !== 'boolean') throw new TypeError('required must be boolean.');
  if (!Number.isInteger(descriptor.maxLength) || descriptor.maxLength < 1) {
    throw new TypeError('maxLength must be a positive integer.');
  }
  if (type === 'date' && descriptor.maxLength !== 10) {
    throw new TypeError('date maxLength must be 10.');
  }
  const options = normalizeOptions(descriptor.options, type);
  return {
    ...descriptor,
    key,
    type,
    options,
    optionLabelsSq: normalizeOptionLabels(descriptor.optionLabelsSq, options),
    ...(descriptor.requiredWhen === undefined
      ? {}
      : { requiredWhen: normalizeRequiredWhen(descriptor.requiredWhen) }),
  };
}

export function normalizeDescriptors(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('requiredResponses must be a non-empty array.');
  }
  const descriptors = value.map(normalizeDescriptor);
  if (new Set(descriptors.map(entry => entry.key)).size !== descriptors.length) {
    throw new TypeError('requiredResponses keys must be unique.');
  }
  const byKey = new Map(descriptors.map(entry => [entry.key, entry]));
  for (const descriptor of descriptors) {
    if (!descriptor.requiredWhen) continue;
    const control = byKey.get(descriptor.requiredWhen.key);
    if (!control) throw new TypeError('requiredWhen key must reference an existing descriptor.');
    if (!control.options.includes(descriptor.requiredWhen.equals)) {
      throw new TypeError('requiredWhen equals must be an allowed controlling option.');
    }
  }
  return descriptors;
}
