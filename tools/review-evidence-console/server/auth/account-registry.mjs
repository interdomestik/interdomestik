import { normalizeAccount } from './account-schema.mjs';

function unique(accounts, key) {
  const values = new Set();
  for (const account of accounts) {
    if (values.has(account[key])) throw new TypeError(`Duplicate ${key}.`);
    values.add(account[key]);
  }
}

export function parseAccountRegistry(json) {
  let value;
  try {
    value = JSON.parse(json);
  } catch {
    throw new TypeError('Invalid account registry JSON.');
  }
  if (!Array.isArray(value) || value.length === 0) throw new TypeError('Empty account registry.');
  const accounts = value.map(normalizeAccount);
  for (const key of ['id', 'username', 'fixtureId']) unique(accounts, key);
  if (new Set(accounts.map(account => account.password.salt)).size !== accounts.length) {
    throw new TypeError('Account password salts must be unique.');
  }
  const iterations = accounts[0].password.iterations;
  if (accounts.some(account => account.password.iterations !== iterations)) {
    throw new TypeError('Account iteration counts must match.');
  }
  return Object.freeze({
    byId: new Map(accounts.map(account => [account.id, account])),
    byUsername: new Map(accounts.map(account => [account.username, account])),
    dummy: accounts[0].password,
  });
}
