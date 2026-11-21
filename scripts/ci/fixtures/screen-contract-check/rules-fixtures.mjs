import assert from 'node:assert/strict';

import { ids } from './harness.mjs';

export const has = (result, check, key) =>
  assert.ok(
    ids(result, check).includes(key),
    `${check} lacks ${key}: ${JSON.stringify(ids(result, check))}`
  );
export const lacks = (result, check, prefix) =>
  assert.deepEqual(
    ids(result, check).filter(id => id.startsWith(prefix)),
    [],
    `${check} ${prefix}`
  );
