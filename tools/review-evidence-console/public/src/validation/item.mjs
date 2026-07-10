import { validateEvidenceRef, validateSafeText } from './input-guards.mjs';
import { descriptorIsRequired } from './descriptor-required.mjs';

const DECISIONS = ['approve', 'change', 'block'];
const SEVERITIES = ['low', 'medium', 'high'];
const SCALAR_OPTIONS = ['option', 'radio', 'select'];
const ARRAY_OPTIONS = ['multi_select', 'checkbox_group'];
const TEXT_FIELDS = [
  ['concreteAnswer', 2000],
  ['reason', 2000],
];

const fieldError = (key, code, message) => ({ key, code, message });
const missing = key => fieldError(key, 'required', 'Plotëso këtë fushë të detyrueshme.');
const isEmpty = value =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validateBase(item, decision, errors) {
  if (!DECISIONS.includes(decision.decision)) errors.push(missing('decision'));
  for (const [key, maxLength] of TEXT_FIELDS) {
    if (isEmpty(decision[key])) errors.push(missing(key));
    else addGuardError(errors, key, validateSafeText(decision[key], { maxLength }));
  }
  if (isEmpty(decision.evidenceRef)) errors.push(missing('evidenceRef'));
  else addGuardError(errors, 'evidenceRef', validateEvidenceRef(decision.evidenceRef));
  if (!isIsoDate(decision.verifiedAt)) {
    errors.push(fieldError('verifiedAt', 'invalid_date', 'Përdor një datë ISO të vlefshme.'));
  }
  const risks = item.allowedRiskCategories;
  if (isEmpty(decision.riskCategory)) errors.push(missing('riskCategory'));
  else if (risks?.length && !risks.includes(decision.riskCategory)) {
    errors.push(fieldError('riskCategory', 'invalid_option', 'Zgjidh një mundësi të lejuar.'));
  }
  if (!SEVERITIES.includes(decision.severity)) {
    errors.push(fieldError('severity', 'invalid_option', 'Zgjidh një mundësi të lejuar.'));
  }
  const changeRequired = ['change', 'block'].includes(decision.decision);
  if (changeRequired && isEmpty(decision.requestedChange)) errors.push(missing('requestedChange'));
  else if (!isEmpty(decision.requestedChange)) {
    addGuardError(
      errors,
      'requestedChange',
      validateSafeText(decision.requestedChange, { maxLength: 1000 })
    );
  }
}

function addGuardError(errors, key, result) {
  if (!result.ok) errors.push(fieldError(key, result.code, result.message));
}

function validateDescriptor(descriptor, responses, errors) {
  const value = responses[descriptor.key];
  const empty = isEmpty(value) || (Array.isArray(value) && value.length === 0);
  if (empty) {
    if (descriptorIsRequired(descriptor, responses)) errors.push(missing(descriptor.key));
    return;
  }
  if (SCALAR_OPTIONS.includes(descriptor.type) && typeof value !== 'string') {
    errors.push(fieldError(descriptor.key, 'invalid_type', 'Përdor një vlerë të vetme.'));
    return;
  }
  if (ARRAY_OPTIONS.includes(descriptor.type) && !Array.isArray(value)) {
    errors.push(fieldError(descriptor.key, 'invalid_type', 'Përdor një listë vlerash.'));
    return;
  }
  if (descriptor.type === 'text' || descriptor.type === 'textarea') {
    addGuardError(
      errors,
      descriptor.key,
      validateSafeText(value, { maxLength: descriptor.maxLength ?? 2000 })
    );
  } else if (descriptor.type === 'evidenceRef') {
    addGuardError(
      errors,
      descriptor.key,
      validateEvidenceRef(value, { maxLength: descriptor.maxLength ?? 240 })
    );
  } else if (descriptor.type === 'date' && !isIsoDate(value)) {
    errors.push(fieldError(descriptor.key, 'invalid_date', 'Përdor një datë ISO të vlefshme.'));
  } else if (descriptor.options?.length) {
    const values = Array.isArray(value) ? value : [value];
    if (values.some(option => !descriptor.options.includes(option))) {
      errors.push(fieldError(descriptor.key, 'invalid_option', 'Zgjidh një mundësi të lejuar.'));
    }
  }
}

export function validateItem(item, decision = {}) {
  const errors = [];
  validateBase(item, decision, errors);
  const responses = decision.responses ?? {};
  for (const descriptor of item.requiredResponses ?? []) {
    validateDescriptor(descriptor, responses, errors);
  }
  return { valid: errors.length === 0, errors };
}
