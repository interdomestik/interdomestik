import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import { withScratchDatabase } from './pg16/scratch-database';

const malformedUrl = 'postgresql://fixture:credential-CANARY@[not-a-host/db';

test('scratch and release fixtures redact refused admin URLs', async t => {
  const saved = process.env.DATABASE_URL;
  t.after(() => {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  });
  for (const url of [
    malformedUrl,
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
        assert.ok(error instanceof Error);
        assert.notEqual((error as { code?: string }).code, 'ERR_INVALID_URL');
        for (const text of [error.message, inspect(error, { depth: 5 }), JSON.stringify(error)]) {
          assert.equal(text.includes('CANARY'), false, 'scratch refusal exposed the credential');
        }
        return true;
      }
    );
    assert.equal(ran, false);
  }

  // Let the child test fail so the spec reporter renders the actual release fixture rejection.
  const probe = `
    import test from 'node:test';
    import { withReleaseDatabase } from './test/pg16/release-migration-fixture.ts';

    test('release fixture refuses a malformed admin URL', t =>
      withReleaseDatabase('release_redaction', { t, dir: '', registry: '' }, () => {
        throw new Error('release work unexpectedly ran');
      })
    );
  `;
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: malformedUrl };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--test-reporter=spec', '--input-type=module', '--eval', probe],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env,
      encoding: 'utf8',
      timeout: 10_000,
    }
  );
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  const output = result.stdout + result.stderr;
  assert.equal(output.includes('CANARY'), false, 'spec reporter exposed the credential');
  assert.ok(output.includes('Seed target refused: invalid'), 'spec reporter missed the refusal');
});
