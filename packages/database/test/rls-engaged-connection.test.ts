import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveRlsTestConnectionConfig,
  TEST_DB_PASSWORD,
  TEST_DB_ROLE,
} from './rls-test-connection';

test('resolveRlsTestConnectionConfig keeps pooler URLs on the admin connection and uses SET ROLE', () => {
  const config = resolveRlsTestConnectionConfig(
    'postgresql://postgres.project-ref:secret@aws-1-eu-west-1.pooler.supabase.com:5432/postgres'
  );

  assert.equal(config.databaseUrlRls, null);
  assert.equal(config.dbRlsRole, TEST_DB_ROLE);
});

test('resolveRlsTestConnectionConfig uses a dedicated low-privilege connection for direct Postgres URLs', () => {
  const config = resolveRlsTestConnectionConfig(
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  );

  assert.ok(config.databaseUrlRls);
  const rlsUrl = new URL(config.databaseUrlRls);
  assert.equal(rlsUrl.protocol, 'postgresql:');
  assert.equal(rlsUrl.username, TEST_DB_ROLE);
  assert.equal(rlsUrl.password, TEST_DB_PASSWORD);
  assert.equal(rlsUrl.hostname, '127.0.0.1');
  assert.equal(rlsUrl.port, '54322');
  assert.equal(rlsUrl.pathname, '/postgres');
  assert.equal(config.dbRlsRole, null);
});
