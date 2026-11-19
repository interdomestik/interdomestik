import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// R-13 (WP-04): the E2E role set-up takes every client from the guarded disposable-target factory,
// which classifies the URL with the PG* environment the driver itself reads and refuses before it
// constructs the driver. Each case runs in a child process whose environment is exactly the case's,
// so the factory sees what the driver would see. No database is needed: a client connects lazily.
const root = fileURLToPath(new URL('../..', import.meta.url));
const roleModule = new URL('../e2e-runtime-role.mjs', import.meta.url).href;
const factory = fileURLToPath(
  new URL('../../packages/database/src/disposable-client.ts', import.meta.url)
);
const LOOPBACK = 'postgresql://postgres:postgres@127.0.0.1:5432/interdomestik_test';

const OPEN = `
const { openGuardedClient } = await import(${JSON.stringify(roleModule)});
try {
  const sql = await openGuardedClient(process.env.PROBE_URL, 'probe');
  await sql.end({ timeout: 0 });
  console.log('opened');
} catch (error) {
  console.log(String(error));
}`;

function inChild(script, env) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...env },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

const open = (url, env = {}) => inChild(OPEN, { PROBE_URL: url, ...env });

test('the role set-up imports no driver of its own', () => {
  const source = readFileSync(new URL('../e2e-runtime-role.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from\s*['"](?:postgres|pg)['"]|import\(\s*['"](?:postgres|pg)['"]/u);
  assert.match(source, /packages\/database\/src\/disposable-client\.ts/u);
});

test('the guarded client refuses every target but loopback and the confirmed CI container', () => {
  const strong = ['Strong', 'Fixture', '-', 'Pass', '42', 'x'.repeat(8)].join('');
  for (const [url, confirm, refusal] of [
    ['postgresql://u:p@db.example.net:5432/app', 'db.example.net', 'non-disposable'],
    [
      'postgresql://u:p@db.xjyseqtfuxcuviiankhy.supabase.co/postgres',
      'xjyseqtfuxcuviiankhy',
      'non-disposable',
    ],
    [
      'postgresql://u:p@db.qwertyuiopasdfghjklz.supabase.co/postgres',
      'qwertyuiopasdfghjklz',
      'non-disposable',
    ],
    [
      'postgresql://postgres.qwertyuiopasdfghjklz:p@aws-0-eu-central-1.pooler.supabase.com:6543/x',
      'qwertyuiopasdfghjklz',
      'non-disposable',
    ],
    ['postgresql://u:p@ci-postgres:5432/interdomestik_test', 'other', 'non-local-unconfirmed'],
    [
      'postgresql://u:p@db.gunosplgrvnvrftudttr.supabase.co/postgres',
      'gunosplgrvnvrftudttr',
      'production',
    ],
  ]) {
    const env = { SEED_TARGET_CONFIRM: `plan070:${confirm}`, E2E_PASSWORD: strong };
    assert.equal(open(url, env), `Error: Seed target refused: ${refusal}`, url);
  }
});

test('the guarded client classifies the URL with the PG* environment the driver reads', () => {
  // A PG* value carries production evidence: refused even on loopback.
  assert.equal(
    open(LOOPBACK, { PGAPPNAME: 'gunosplgrvnvrftudttr' }),
    'Error: Seed target refused: production'
  );
  // A host-less URL, which the driver would complete from PGHOST, is refused outright.
  assert.equal(
    open('postgresql:///interdomestik_test', { PGHOST: 'db.example.net' }),
    'Error: Seed target refused: invalid'
  );
  // A host address or option set that could send the driver elsewhere is refused.
  assert.equal(open(LOOPBACK, { PGHOSTADDR: '10.0.0.7' }), 'Error: Seed target refused: ambiguous');
  assert.equal(
    open(LOOPBACK, { PGOPTIONS: '-c search_path=x' }),
    'Error: Seed target refused: ambiguous'
  );
  assert.equal(open(LOOPBACK, { PGUSER: 'someone_else' }), 'Error: Seed target refused: ambiguous');
  // The E2E server runs with NODE_ENV=production against its loopback database, and its app URLs
  // are not the URL being opened: neither is a target fact.
  assert.equal(
    open(LOOPBACK, {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@db.example.net/app',
      DATABASE_URL_RLS: 'postgresql://u:p@db.example.net/app',
      PGPORT: '55432',
    }),
    'opened'
  );
});

test('the guarded client opens loopback and the confirmed CI container lazily', () => {
  assert.equal(open(LOOPBACK), 'opened');
  assert.equal(
    open('postgresql://postgres:postgres@ci-postgres:5432/interdomestik_test', {
      SEED_TARGET_CONFIRM: 'plan070:ci-postgres',
    }),
    'opened'
  );
});

test('withDisposableClient closes the client when the work fails', () => {
  const script = `
const api = await import('tsx/cjs/api');
const { withDisposableClient } = api.require(${JSON.stringify(factory)}, import.meta.url);
let held;
try {
  await withDisposableClient(process.env.PROBE_URL, { applicationName: 'probe' }, async client => {
    held = client;
    throw new Error('work failed');
  });
} catch (error) {
  console.log(String(error));
}
try {
  await held.unsafe('select 1');
  console.log('still open');
} catch (error) {
  console.log(error.code);
}`;
  assert.equal(inChild(script, { PROBE_URL: LOOPBACK }), 'Error: work failed\nCONNECTION_ENDED');
});

const RUNTIME = `
const { provisionE2eRuntimeRole, resolveE2eRuntimeUrl } = await import(${JSON.stringify(roleModule)});
try {
  if (process.env.MODE?.startsWith('resolve')) {
    const derived = new URL(resolveE2eRuntimeUrl(process.env.PROBE_URL));
    const explicit = new URL(process.env.PROBE_URL);
    explicit.port = process.env.MODE === 'resolve54322' ? '54322' : '5432';
    const ported = new URL(resolveE2eRuntimeUrl(explicit.toString()));
    console.log(derived.password === ported.password ? 'same' : 'different');
    console.log(resolveE2eRuntimeUrl(process.env.PROBE_URL, ported.toString()) ? 'override' : '');
  } else {
    await provisionE2eRuntimeRole({ adminUrl: process.env.PROBE_URL, env: {} });
    console.log('provisioned');
  }
} catch (error) {
  console.log(String(error));
}`;

test('both URLs pass the guarded check before any role statement (round 6)', () => {
  // PGUSER is the admin's own user: the admin URL passes, the derived runtime-role URL is
  // ambiguous. Nothing listens on port 1, so a statement sent first would fail to connect instead.
  const admin = 'postgresql://postgres:postgres@127.0.0.1:1/interdomestik_test';
  assert.equal(
    inChild(RUNTIME, { PROBE_URL: admin, PGUSER: 'postgres' }),
    'Error: Seed target refused: ambiguous'
  );
});

test('the role password keys on the port the driver uses, however PGPORT spells it (round 6)', () => {
  const portless = 'postgresql://postgres:postgres@127.0.0.1/interdomestik_test';
  for (const PGPORT of ['5432', '05432']) {
    assert.equal(
      inChild(RUNTIME, { PROBE_URL: portless, PGPORT, MODE: 'resolve' }),
      'same\noverride'
    );
  }
  // A leading zero on the repository's local port (54322) is still that port (round 7).
  assert.equal(
    inChild(RUNTIME, { PROBE_URL: portless, PGPORT: '054322', MODE: 'resolve54322' }),
    'same\noverride'
  );
  for (const PGPORT of ['54x', '0', '65536', '0000000065536', '+5432', ' 5432']) {
    assert.match(
      inChild(RUNTIME, { PROBE_URL: portless, PGPORT, MODE: 'resolve' }),
      /PGPORT must be a port number/u,
      PGPORT
    );
  }
});
