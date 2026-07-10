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
    return failure('invalid_text', 'Enter text in the expected format.');
  }
  if (value.length > maxLength) {
    return failure('too_long', `Use no more than ${maxLength} characters.`);
  }
  if (
    CONTROL_CHARACTERS.test(value) ||
    EMAIL.test(value) ||
    URL_SCHEME.test(value) ||
    CREDENTIAL.test(value) ||
    NUMERIC_SEQUENCE.test(value)
  ) {
    return failure('sensitive_input', 'Use repo-safe operational text only.');
  }
  return { ok: true };
}

export function validateEvidenceRef(value) {
  if (typeof value !== 'string') {
    return failure('invalid_reference', 'Use a repo-relative evidence reference.');
  }
  const reference = value.trim();
  if (
    reference.length > 240 ||
    CONTROL_CHARACTERS.test(reference) ||
    reference.includes('..') ||
    reference.includes('//') ||
    !REPO_REFERENCE.test(reference)
  ) {
    return failure('invalid_reference', 'Use a repo-relative evidence reference.');
  }
  return { ok: true };
}
