import assert from 'node:assert/strict';
import test from 'node:test';

import { isTransactionPooler } from '../src/pooler-mode';

const cases: [string, string, string | undefined, boolean][] = [
  ['transaction port', 'postgres://user:pass@pooler.example:6543/app', undefined, true],
  ['postgresql scheme', 'postgresql://user:pass@pooler.example:6543/app', undefined, true],
  ['session port', 'postgres://user:pass@pooler.example:5432/app', undefined, false],
  ['local database', 'postgres://postgres:postgres@localhost:54322/postgres', undefined, false],
  ['missing port', 'postgres://user:pass@pooler.example/app', undefined, false],
  ['explicit override', 'postgres://user:pass@pooler.example:5432/app', '1', true],
  ['override on local', 'postgres://user:pass@127.0.0.1:5432/app', '1', true],
  ['zero preserves port detection', 'postgres://user:pass@pooler.example:6543/app', '0', true],
  ['zero does not enable', 'postgres://user:pass@pooler.example:5432/app', '0', false],
  ['true does not enable', 'postgres://user:pass@pooler.example:5432/app', 'true', false],
  ['malformed URL', 'not a URL', undefined, false],
  ['malformed port', 'postgres://user:pass@pooler.example:invalid/app', undefined, false],
  ['other scheme', 'https://pooler.example:6543/app', undefined, false],
  ['empty URL', '', undefined, false],
];

for (const [label, url, override, expected] of cases) {
  test(label, () => assert.equal(isTransactionPooler(url, override), expected));
}
