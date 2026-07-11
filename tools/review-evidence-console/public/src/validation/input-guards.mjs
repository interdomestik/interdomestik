const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const URL_SCHEME = /\b(?:https?|ftp|file|data):\/\//i;
const CREDENTIAL =
  /\b(?:Bearer|Basic|api[_-]?key|access[_-]?token|refresh[_-]?token)\b|\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]+/i;
const NUMERIC_SEQUENCE = /\b[0-9]{12,19}\b/;
const REPO_REFERENCE = /^(docs|output\/review)\/[A-Za-z0-9._/-]+(?:#L[1-9][0-9]*)?$/;

const failure = (code, message) => ({ ok: false, code, message });

export function validateSafeText(value, { maxLength = 2000 } = {}) {
  if (typeof value !== 'string') {
    return failure('invalid_text', 'Shkruaj tekst në formatin e pritur.');
  }
  if (value.length > maxLength) {
    return failure('too_long', `Përdor jo më shumë se ${maxLength} shenja.`);
  }
  if (
    CONTROL_CHARACTERS.test(value) ||
    EMAIL.test(value) ||
    URL_SCHEME.test(value) ||
    CREDENTIAL.test(value) ||
    NUMERIC_SEQUENCE.test(value)
  ) {
    return failure('sensitive_input', 'Përdor vetëm tekst operacional të sigurt për repo.');
  }
  return { ok: true };
}

export function validateEvidenceRef(value, { maxLength = 240 } = {}) {
  if (typeof value !== 'string') {
    return failure('invalid_reference', 'Përdor një referencë evidence brenda repos.');
  }
  const reference = value.trim();
  if (
    reference.length > Math.min(maxLength, 240) ||
    CONTROL_CHARACTERS.test(reference) ||
    reference.includes('..') ||
    reference.includes('//') ||
    !REPO_REFERENCE.test(reference)
  ) {
    return failure('invalid_reference', 'Përdor një referencë evidence brenda repos.');
  }
  return { ok: true };
}
