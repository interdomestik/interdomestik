import assert from 'node:assert/strict';
import test from 'node:test';
import { inspect } from 'node:util';
import { withScratchDatabase } from './pg16/scratch-database';

// WP-04 (R-13, R-25): the pg16 lane's entry hands the admin URL to the guarded factory before it
// parses it, so a refused or malformed URL surfaces only the factory's redacted refusal.
test('a malformed or refused admin URL reaches no parser and leaks no credential', async t => {
  const saved = process.env.DATABASE_URL;
  t.after(() => {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  });
  for (const url of [
    'postgresql://fixture:credential-CANARY@[not-a-host/db',
    'postgresql://fixture:credential-CANARY@db.example.net:5432/app',
    'credential-CANARY',
  ]) {
    process.env.DATABASE_URL = url;
    let ran = false;
    await assert.rejects(
      withScratchDatabase('wp04_redaction', () => {
        ran = true;
        return Promise.resolve();
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error, url);
        assert.notEqual((error as { code?: string }).code, 'ERR_INVALID_URL', url);
        for (const text of [error.message, inspect(error, { depth: 5 }), JSON.stringify(error)]) {
          assert.doesNotMatch(text, /CANARY/u, url);
        }
        return true;
      }
    );
    assert.equal(ran, false, url);
  }
});
