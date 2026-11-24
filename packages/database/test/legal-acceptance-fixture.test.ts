import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const member = {
  id: 'fixture-member',
  tenantId: 'fixture-tenant',
  email: 'fixture-member@example.test',
};

function runFixtureTool(mode: 'seed' | 'clean', identities: unknown) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'test/legal-acceptance-fixture.test-support.ts',
      mode,
      JSON.stringify(identities),
    ],
    {
      cwd: new URL('../', import.meta.url),
      encoding: 'utf8',
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://fixture@remote.example.test/fixture',
        SEED_TARGET_CONFIRM: 'plan070:remote.example.test',
      },
      timeout: 10_000,
    }
  );
}

test('synthetic fixture seeding and cleanup refuse a non-disposable target', () => {
  for (const mode of ['seed', 'clean'] as const) {
    const result = runFixtureTool(mode, [member]);
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), 'Fixture database target refused');
  }
});

test('the fixture tool rejects a non-synthetic identity before opening the database', () => {
  const result = runFixtureTool('seed', [{ ...member, email: 'fixture@example.com' }]);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim(), 'Synthetic legal acceptance fixture operation failed');
});
