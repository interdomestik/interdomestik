const USERNAME = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const IDENTIFIER = /^[a-z][a-z0-9_]{2,63}$/u;
const ROLES = new Set(['governance', 'legal_privacy', 'executive_owner', 'platform_guardian']);

function requiredString(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new TypeError(`Invalid ${label}.`);
  return value;
}

export function decodeCredential(value, min, max, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new TypeError(`Invalid ${label}.`);
  }
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length < min || bytes.length > max || bytes.toString('base64url') !== value) {
    throw new TypeError(`Invalid ${label}.`);
  }
  return bytes;
}

export function normalizeAccount(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid account.');
  const username = typeof value.username === 'string' ? value.username.trim().toLowerCase() : '';
  requiredString(username, USERNAME, 'username');
  const role = requiredString(value.role, IDENTIFIER, 'role');
  if (!ROLES.has(role)) throw new TypeError('Invalid role.');
  if (typeof value.displayName !== 'string' || !value.displayName.trim() || value.displayName.length > 100) {
    throw new TypeError('Invalid display name.');
  }
  if (typeof value.disabled !== 'boolean') throw new TypeError('Invalid disabled state.');
  if (!Number.isSafeInteger(value.sessionVersion) || value.sessionVersion < 0) {
    throw new TypeError('Invalid session version.');
  }
  const password = value.password;
  if (!password || password.algorithm !== 'PBKDF2-SHA256') throw new TypeError('Invalid password.');
  if (!Number.isSafeInteger(password.iterations) || password.iterations < 600_000 || password.iterations > 1_000_000) {
    throw new TypeError('Invalid iterations.');
  }
  decodeCredential(password.salt, 16, 32, 'salt');
  decodeCredential(password.hash, 32, 32, 'hash');
  return Object.freeze({
    id: requiredString(value.id, IDENTIFIER, 'account id'),
    username,
    displayName: value.displayName.trim(),
    role,
    fixtureId: requiredString(value.fixtureId, IDENTIFIER, 'fixture id'),
    disabled: value.disabled,
    sessionVersion: value.sessionVersion,
    password: Object.freeze({ ...password }),
  });
}
