import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { checkServerIdentity } from 'node:tls';
import { inspect } from 'node:util';
import { resolveAdminConnectionConfig } from '../src/admin-connection-config';
const CA_PEM_BASE64 =
  'LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCk1JSURFVENDQWZtZ0F3SUJBZ0lVWWpTSkJSQ1dyRGVvZ2tHNFBIVGtEbS9oVjY4d0RRWUpLb1pJaHZjTkFRRUwKQlFBd0dERVdNQlFHQTFVRUF3d05VREJoTUdFZ1ZHVnpkQ0JEUVRBZUZ3MHlOakEzTVRreE16QTFOVGhhRncwegpOakEzTVRZeE16QTFOVGhhTUJneEZqQVVCZ05WQkFNTURWQXdZVEJoSUZSbGMzUWdRMEV3Z2dFaU1BMEdDU3FHClNJYjNEUUVCQVFVQUE0SUJEd0F3Z2dFS0FvSUJBUUMzL0hTUHhjZnc4NlRGM0Q5VnY1MCtXK0hZelFxWVNTTVMKWWFnSjhMNDd0RmZmMVZvMzlqWXltODB6cEtiS0ZibUV2WXM5N0VKbEVvaHM1UzlkOUxhWllVb3NSdWVEelNRdwpiYW53dGF0b1QvOENJUVdUWWlRcDZ6V1VHd0FXbUlSRXQrbEJhOFpPYzdiek90eUxJVEpoZUpUVTBwUXMxRTRnCmczUThBMXFody93TGY0QnR0RGZpeGxZdmtwY3NJMzFmdVJCazQ2MFZZbytLT3ZvTy9XQjFpL0VUWHdxSzQzT0wKTytGRnFOcWpBcytyVHV6Y3BzWjBlZDd3QW1Yb1dXdW9mamUxNmFIQ2JGWDYxOUw0TUlYTjF1MHBJajR5N3BDdwozbmxqZC9naUROaGJlQ2RKMW5aMXF4QUhzaGhiMWQwSjZEanBDN0tyd00zRnVJNUJpWXZCQWdNQkFBR2pVekJSCk1CMEdBMVVkRGdRV0JCVERmN1JTV2lzTzJPTzBHakVaVTQ2VW5IR2J2ekFmQmdOVkhTTUVHREFXZ0JURGY3UlMKV2lzTzJPTzBHakVaVTQ2VW5IR2J2ekFQQmdOVkhSTUJBZjhFQlRBREFRSC9NQTBHQ1NxR1NJYjNEUUVCQ3dVQQpBNElCQVFBMEw3dXhMZ3Nxdm8wZlltNWlObXFGRDZVME01WS9ZZHc4UnJYc2RJeHBvcGVsWEVzWkF4SmhzV2V0CkQyQmJqZ3hIWVZGeDRZcmtlQWVVNWlQN1MwbWhGY0tvOVdWN1VZY1EvQktleTVhVENHakRaUmtNMzFoRCtsQzMKN09acHdoR1VyMCtBaHpmZG1SNTQzdkxnODNEd1VQWnlUbWUwOFlCUTQ3Rnc5cHhaL3FQZlVsRCtIM3VhbHVtdApCcWdXZXR0aEpZU3lrNUVYQmFsUXh0SGNpaWxhQVB4QWIxTUJSYTlLbmZpR3daOGUrQVdETDR5U0tlM2JpMmQyClhESUl4WW5EL1V0Tlg1ZTJNMy9IZlJGQTIyNW5tdHJuQkZDa0ovMlROU1g2UVlmMlRhY1hUMDliM1U4b0VpN0UKeDVyRG9Wd1RyUFNrRzZaNk5sT2huSWpmYXQ2SgotLS0tLUVORCBDRVJUSUZJQ0FURS0tLS0tCg==';
const LEAF_PEM_BASE64 =
  'LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCk1JSURDRENDQWZDZ0F3SUJBZ0lVVVZTRldVYnppYWxtcHA2UCtTaFNMYmk2aXJZd0RRWUpLb1pJaHZjTkFRRUwKQlFBd0ZURVRNQkVHQTFVRUF3d0tVREJoTUdFZ1RHVmhaakFlRncweU5qQTNNVGt4TXpBMU5UaGFGdzB6TmpBMwpNVFl4TXpBMU5UaGFNQlV4RXpBUkJnTlZCQU1NQ2xBd1lUQmhJRXhsWVdZd2dnRWlNQTBHQ1NxR1NJYjNEUUVCCkFRVUFBNElCRHdBd2dnRUtBb0lCQVFDN1REc2E0OGkvMCszcTJRVUVwZnU2L3IrcSt6UnQrVndaNk5tUjVxMDMKai9vOFZyMzRiMHIxWk92NEJHUStzM2FBQVc0R2xWanhhZXpXUHB1R2d6R0VkSVpDT3J5SHBUVFFsUW5kVWRmbQo4bm1Qam9GUEYxNDBDaDlZdDhDUmo3TVNPN0R0TWF1Qm1uYWFjRmJGOG90ZUdOTG5PMmc1a2RRbjgwcUppWk5ICjA0UCt2ZVZSYXJqZ2hSNWp5QmppclczMndBWlhEMU4yejRJL2ZqalgxNTYzMzFoQzl1ZTEreEJMTVMxblN4ckYKS0d2MDk3TzZKcjlScXZSNk4yeWRJTFloTUlUb0szQXJzS2gwcG9FbXE1OFNTVExPWTJsQ1U0Q0l5YlpTSGNUOQp0TmtOQzQxR2FJbmo2eDkzL3hLMklOSXBnYWVYcWE1Nys1WFRaOWdEMXF6ekFnTUJBQUdqVURCT01CMEdBMVVkCkRnUVdCQlI1bU1zZ01tZTJLRjdkdXNrV0V6Z1BsL0tXYURBZkJnTlZIU01FR0RBV2dCUjVtTXNnTW1lMktGN2QKdXNrV0V6Z1BsL0tXYURBTUJnTlZIUk1CQWY4RUFqQUFNQTBHQ1NxR1NJYjNEUUVCQ3dVQUE0SUJBUUNVUXQ5egozSkI2enhoeTBGS2FrTUY0Q0hoQ1BKN0t0aU1zUUQ2OGQ0bEwxZVppUHFwUTQyT2s1QUE3ZktSaWtBa2NtL0pIClZPTTdnKzB6Vk14blNhQW11M2V6am0vR1RvdU5Rb1RYc2x6dTZGN1hrcldrODc4Mi9VOGtnYmtwQ1dJaEZzbFgKQTl6TzZPMlBhWmEyQklhd1JqQjRtb01xMFdzKzFVNTRwZTBRNnYwZXdQSWV0YWoxeDAwWC96R2NjMm9jZHY1bgphTXFON1N5ZjNXd0xuZ2x5cHo3RHh5SUVaN3UrUVRiRGVIK2x1dDdndFlVTDZLQmt4a2xUaUJQVHdTODZudFh2CkZPbmNIQW84cE5Edk54Q1dQU2NyUGI1OW9yQ0poZTVtNGY2RmNWM2hwZDlIUHlOQW55YzVmTnBVYXpuaUVXUlMKU2lFbXhrYmFOMVFDT2lQKwotLS0tLUVORCBDRVJUSUZJQ0FURS0tLS0tCg==';
const CA_PEM = Buffer.from(CA_PEM_BASE64, 'base64').toString('utf8');
const SOURCE = readFileSync(new URL('../src/admin-connection-config.ts', import.meta.url), 'utf8');
const CERT = new X509Certificate(CA_PEM);
const VALID_NOW = Math.trunc((Date.parse(CERT.validFrom) + Date.parse(CERT.validTo)) / 2);
const CA_INVALID = 'ADMIN_DB_CONFIG_CA_INVALID';
type Env = Readonly<Record<string, unknown>>;
const LOCAL_URL = 'postgres://admin:secret@127.0.0.1:5439/interdomestik_admin_config_test';
const localEnv = (DATABASE_URL = LOCAL_URL) => ({
  DATABASE_URL,
  NODE_ENV: 'test',
  ADMIN_DB_LOCAL_SCRATCH: '1',
});
const remoteEnv = (ca = CA_PEM_BASE64) => ({
  DATABASE_URL: 'postgresql://admin:secret@db.abc123def456ghi789jk.supabase.co:5432/app',
  DATABASE_ADMIN_CA_PEM_BASE64: ca,
});
function fail(env: Env, code: string, field: string, now = VALID_NOW) {
  const result = resolveAdminConnectionConfig(env, now);
  assert.deepEqual(result, { ok: false, error: { code, field } });
  return result;
}
test('statically enforces the pure no-I/O boundary', () => {
  const forbidden =
    /\bpostgres\s*\(|from ['"]node:(?:net|dns|fs|child_process|timers(?:\/promises)?)['"]|\b(?:fetch|setTimeout|setInterval|setImmediate)\s*\(|\b(?:net|tls)\s*\.\s*(?:connect|createConnection)\s*\(|from ['"][^'"]*(?:drizzle|migration|\/migrate)['"]|\bsql\s*`|\b(?:console\.(?:log|warn|error)|process\.(?:stdout|stderr)\.write)\s*\(|\bprocess\.env(?:\.[A-Za-z_]\w*|\[[^\]]+\])\s*=/;
  assert.doesNotMatch(SOURCE, forbidden);
  assert.match(SOURCE, /import type postgres from 'postgres'/);
});
test('locks loopback options and keeps the configuration opaque and immutable', () => {
  const result = resolveAdminConnectionConfig(localEnv(), VALID_NOW);
  if (!result.ok) assert.fail('expected accepted loopback configuration');
  // prettier-ignore
  assert.equal(JSON.stringify(result.config), '{"contract_version":"admin_connection_config_v1","endpoint_class":"local_scratch","transport_policy":"unauthenticated_loopback_test_only","connection_count":1,"target_session":"primary"}');
  assert.deepEqual(Object.keys(result.config), []);
  assert(Object.isFrozen(result.config));
  const first = result.config.toPostgresOptions();
  const second = result.config.toPostgresOptions();
  assert.notEqual(first, second);
  // prettier-ignore
  assert.equal(Object.keys(first).sort().join(','), 'backoff,connect_timeout,connection,database,debug,fetch_types,host,idle_timeout,keep_alive,max,max_lifetime,max_pipeline,onnotice,onparameter,password,path,port,prepare,publications,ssl,sslnegotiation,target_session_attrs,transform,types,username');
  // prettier-ignore
  assert.equal(JSON.stringify(first), '{"host":"127.0.0.1","port":5439,"database":"interdomestik_admin_config_test","username":"admin","password":"secret","ssl":false,"sslnegotiation":null,"max":1,"idle_timeout":0,"connect_timeout":5,"max_lifetime":null,"max_pipeline":1,"backoff":false,"keep_alive":30,"prepare":false,"debug":false,"fetch_types":false,"publications":"none","target_session_attrs":"primary","types":{},"transform":{},"connection":{"application_name":"interdomestik_admin_config_v1"}}');
  assert.equal(first.path, undefined);
  assert.equal(first.transform?.undefined, undefined);
  assert.equal(typeof first.onnotice, 'function');
  assert.equal(typeof first.onparameter, 'function');
  for (const value of [first, first.types, first.transform, first.connection])
    assert(Object.isFrozen(value));
  assert(!JSON.stringify(result).includes('secret'));
  assert(!inspect(result).includes('secret'));
});
test('rejects ambiguous URLs, endpoints, and implicit loopback authority', () => {
  const encodedInvalidUrls =
    'POSTGRES://a:b@127.0.0.1:5432/interdomestik_admin_config_x|postgres://a:b@::1:5439/interdomestik_admin_config_x|postgres://a@127.0.0.1:5432/interdomestik_admin_config_x|postgres://a:b@127.0.0.1/interdomestik_admin_config_x|postgres://a:b@127.0.0.1:5432/db/extra|postgres://a:b@127.0.0.1:5432/db?sslmode=require|postgres://a:b@127.0.0.1:5432/db#fragment|postgres://a:b@127.0.0.1,127.0.0.2:5432/db|postgres://a:b@@127.0.0.1:5432/db|postgres://a:b@%31%32%37.0.0.1:5432/db|postgres://a:%40b@127.0.0.1:5432/db|postgres://a:b@127.0.0.1:5432/db%2Fother|postgres://a:b@127.0.0.1:5432/db%ZZ|postgres://a:b@db.ABC123def456ghi789jk.supabase.co:5432/db|postgres://a:b@db.abc123def456ghi789jk.supabase.co.:5432/db';
  const invalidUrls: unknown[] = [undefined, 123, '', ...encodedInvalidUrls.split('|'), 'bad\n'];
  for (const DATABASE_URL of invalidUrls) {
    // prettier-ignore
    fail({ ...localEnv(), DATABASE_URL }, DATABASE_URL === undefined ? 'ADMIN_DB_CONFIG_MISSING' : 'ADMIN_DB_CONFIG_URL_INVALID', 'url');
  }
  const rejectedHosts =
    '[::1]:5439|localhost:5432|127.0.0.2:5432|aws-0-eu.pooler.supabase.com:6543|db.abc123def456ghi789jk.supabase.co:6543';
  for (const host of rejectedHosts.split('|')) {
    // prettier-ignore
    fail(localEnv(`postgres://a:b@${host}/interdomestik_admin_config_x`), 'ADMIN_DB_CONFIG_ENDPOINT_REJECTED', 'endpoint');
  }
  // prettier-ignore
  for (const env of [{ ...localEnv(), NODE_ENV: 'production' }, { ...localEnv(), NODE_ENV: 'CI' }, { ...localEnv(), ADMIN_DB_LOCAL_SCRATCH: 'true' }, localEnv('postgres://a:b@127.0.0.1:5432/app')]) {
    fail(env, 'ADMIN_DB_CONFIG_LOCAL_AUTHORITY_REQUIRED', 'local_authority');
  }
});
test('requires a bounded current CA and returns the exact remote TLS/options posture', () => {
  fail({ DATABASE_URL: remoteEnv().DATABASE_URL }, 'ADMIN_DB_CONFIG_CA_REQUIRED', 'ca');
  // prettier-ignore
  for (const ca of [`${CA_PEM_BASE64}\n`, LEAF_PEM_BASE64, Buffer.from(`${CA_PEM}${CA_PEM}`).toString('base64'), Buffer.from(`${CA_PEM}trailing-data`).toString('base64'), Buffer.alloc(65_537).toString('base64')]) {
    fail(remoteEnv(ca), CA_INVALID, 'ca');
  }
  const invalidAt = (now: number) => fail(remoteEnv(), CA_INVALID, 'ca', now);
  invalidAt(Date.parse(CERT.validFrom) - 1);
  invalidAt(Date.parse(CERT.validTo) + 1);
  const ignoredNames =
    'PGHOST PGPORT PGUSERNAME PGUSER PGPASSWORD PGDATABASE PGMAX PGSSL PGSSLMODE PGSSLNEGOTIATION PGIDLE_TIMEOUT PGCONNECT_TIMEOUT PGMAX_LIFETIME PGMAX_PIPELINE PGBACKOFF PGKEEP_ALIVE PGPREPARE PGDEBUG PGFETCH_TYPES PGPUBLICATIONS PGTARGET_SESSION_ATTRS PGTARGETSESSIONATTRS PGAPPNAME USER USERNAME LOGNAME DATABASE_URL_RLS DB_RLS_ROLE E2E_DATABASE_URL E2E_DATABASE_URL_ADMIN NODE_EXTRA_CA_CERTS SSL_CERT_FILE NODE_TLS_REJECT_UNAUTHORIZED';
  const ignored = Object.fromEntries(ignoredNames.split(' ').map(key => [key, `SENTINEL_${key}`]));
  const hostile = { ...remoteEnv(), ...ignored };
  const result = resolveAdminConnectionConfig(hostile, VALID_NOW);
  if (!result.ok) assert.fail('expected accepted remote configuration');
  const options = result.config.toPostgresOptions();
  const baseline = resolveAdminConnectionConfig(remoteEnv(), VALID_NOW);
  if (!baseline.ok) assert.fail('expected baseline remote configuration');
  assert.deepEqual(options, baseline.config.toPostgresOptions());
  // prettier-ignore
  assert.equal(JSON.stringify(result.config), '{"contract_version":"admin_connection_config_v1","endpoint_class":"supabase_direct","transport_policy":"explicit_ca_hostname_verified","connection_count":1,"target_session":"primary"}');
  const ssl = options.ssl as Record<string, unknown>;
  assert.equal(
    Object.keys(ssl).sort().join(','),
    'ca,checkServerIdentity,rejectUnauthorized,servername'
  );
  assert.equal(ssl.ca, CA_PEM);
  assert.equal(ssl.rejectUnauthorized, true);
  assert.equal(ssl.servername, 'db.abc123def456ghi789jk.supabase.co');
  assert.equal(ssl.checkServerIdentity, checkServerIdentity);
  assert(Object.isFrozen(options.ssl));
  for (const sentinel of Object.values(hostile).filter(value => value.startsWith('SENTINEL_'))) {
    assert(!JSON.stringify(result).includes(sentinel));
    assert(!inspect(result).includes(sentinel));
  }
});
test('returns stable redacted failures and emits no stdout or stderr', t => {
  const sentinel = 'DO_NOT_DISCLOSE_SENTINEL';
  const output: string[] = [];
  const capture = (chunk: string | Uint8Array) => (output.push(String(chunk)), true);
  t.mock.method(process.stdout, 'write', capture as typeof process.stdout.write);
  t.mock.method(process.stderr, 'write', capture as typeof process.stderr.write);
  const redacted = (env: Env, code: string, field: string) => {
    const result = fail(env, code, field);
    assert(!JSON.stringify(result).includes(sentinel));
    assert(!inspect(result).includes(sentinel));
    assert.deepEqual(Object.keys(result), ['ok', 'error']);
    if (result.ok) assert.fail('expected rejected configuration');
    assert.deepEqual(Object.keys(result.error), ['code', 'field']);
  };
  // prettier-ignore
  redacted({ DATABASE_URL: `postgres://${sentinel}:secret@127.0.0.1:5432/db?${sentinel}` }, 'ADMIN_DB_CONFIG_URL_INVALID', 'url');
  // prettier-ignore
  redacted({ DATABASE_URL: `postgres://user:${sentinel}@127.0.0.1:5432/db` }, 'ADMIN_DB_CONFIG_LOCAL_AUTHORITY_REQUIRED', 'local_authority');
  // prettier-ignore
  redacted({ DATABASE_URL: `postgres://user:secret@${sentinel.toLowerCase()}:5432/db` }, 'ADMIN_DB_CONFIG_ENDPOINT_REJECTED', 'endpoint');
  // prettier-ignore
  redacted({ DATABASE_URL: `postgres://user:secret@127.0.0.1:5432/${sentinel}` }, 'ADMIN_DB_CONFIG_LOCAL_AUTHORITY_REQUIRED', 'local_authority');
  redacted({ ...remoteEnv(sentinel), PGHOST: sentinel }, CA_INVALID, 'ca');
  assert.deepEqual(output, []);
});
