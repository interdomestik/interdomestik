import { createHash, pbkdf2 as pbkdf2Callback, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

import { parseAccountRegistry } from '../auth/account-registry.mjs';

const pbkdf2 = promisify(pbkdf2Callback);

function compareAccountIds(a, b) {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function registryFingerprint(accounts) {
  const canonical = JSON.stringify([...accounts].sort(compareAccountIds));
  return createHash('sha256').update(canonical).digest('base64url');
}

export function mutateAccounts(accounts, operation) {
  const rows = structuredClone(accounts);
  if (operation.action === 'add') rows.push(operation.account);
  else {
    const index = rows.findIndex(row => row.username === operation.username);
    if (index < 0) throw new TypeError('Account is unavailable.');
    if (operation.action === 'rotate') rows[index].password = operation.password;
    else if (operation.action === 'disable') rows[index].disabled = true;
    else if (operation.action === 'invalidate') rows[index].sessionVersion += 1;
    else throw new TypeError('Unsupported account operation.');
  }
  const registry = parseAccountRegistry(JSON.stringify(rows));
  return [...registry.byId.values()];
}

export async function deriveCredential(password, { iterations = 600_000, salt = randomBytes(24) } = {}) {
  if (typeof password !== 'string' || Buffer.byteLength(password) < 20 || Buffer.byteLength(password) > 256) {
    throw new TypeError('Password must contain 20-256 UTF-8 bytes.');
  }
  const hash = await pbkdf2(password, salt, iterations, 32, 'sha256');
  return Object.freeze({
    algorithm: 'PBKDF2-SHA256', iterations,
    salt: Buffer.from(salt).toString('base64url'), hash: hash.toString('base64url'),
  });
}
