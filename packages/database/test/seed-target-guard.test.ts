import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertSeedTargetAllowed } from '../src/seed-target-guard';

const production = 'gunosplgrvnvrftudttr';
const staging = 'xjyseqtfuxcuviiankhy';
const local = 'postgresql://fixture:credential-CANARY@127.0.0.1:54322/postgres';
const direct = (ref: string) => `postgresql://fixture:credential-CANARY@db.${ref}.supabase.co/db`;
const pooled = (ref: string) =>
  `postgresql://postgres.${ref}:credential-CANARY@aws-0-eu.pooler.supabase.com:6543/db`;

test('loopback needs no confirmation; missing/malformed/non-postgres targets fail closed', () => {
  for (const host of ['localhost', '127.0.0.1', '127.0.0.1:55438', '[::1]']) {
    assert.equal(
      assertSeedTargetAllowed({ DATABASE_URL: `postgres://fixture@${host}/db` }),
      'local'
    );
  }
  for (const DATABASE_URL of [undefined, '', 'CANARY', 'https://localhost/db']) {
    assert.throws(() => assertSeedTargetAllowed({ DATABASE_URL }), /refused: invalid$/);
  }
});

test('production cannot be enabled by reset flags, staging tokens or local markers', () => {
  const productionTargets = [
    direct(production),
    pooled(production),
    pooled(production).replace('postgres.', 'postgres%2E'),
    direct(production).replace('db.gunos', 'db.%67unos'),
    `postgresql://postgres.${production}%@127.0.0.1/db`,
  ];
  for (const DATABASE_URL of productionTargets) {
    assert.throws(
      () =>
        assertSeedTargetAllowed({
          DATABASE_URL,
          NODE_ENV: 'test',
          SEED_ALLOW_RESET: 'true',
          SEED_TARGET_CONFIRM: `plan070:${production}`,
        }),
      /refused: production$/
    );
  }
  for (const marker of ['NODE_ENV', 'VERCEL_ENV']) {
    assert.throws(
      () => assertSeedTargetAllowed({ DATABASE_URL: local, [marker]: 'production' }),
      /production$/
    );
  }
  for (const marker of ['SUPABASE_PROJECT_REF', 'SUPABASE_REF', 'SUPABASE_PROJECT_ID']) {
    assert.throws(
      () => assertSeedTargetAllowed({ DATABASE_URL: local, [marker]: production }),
      /production$/
    );
  }
  for (const marker of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']) {
    assert.throws(
      () =>
        assertSeedTargetAllowed({
          DATABASE_URL: local,
          [marker]: `https://${production}.supabase.co`,
        }),
      /production$/
    );
  }
});

test('non-local requires an exact target-bound token, including container DNS', () => {
  for (const DATABASE_URL of [direct(staging), pooled(staging)]) {
    assert.throws(() => assertSeedTargetAllowed({ DATABASE_URL }), /non-local-unconfirmed$/);
    assert.throws(
      () => assertSeedTargetAllowed({ DATABASE_URL, SEED_TARGET_CONFIRM: 'true' }),
      /non-local-unconfirmed$/
    );
    assert.equal(
      assertSeedTargetAllowed({ DATABASE_URL, SEED_TARGET_CONFIRM: `plan070:${staging}` }),
      'confirmed-non-local'
    );
  }
  const DATABASE_URL = 'postgres://fixture@ci-postgres/test';
  assert.throws(() => assertSeedTargetAllowed({ DATABASE_URL }), /non-local-unconfirmed$/);
  assert.equal(
    assertSeedTargetAllowed({ DATABASE_URL, SEED_TARGET_CONFIRM: 'plan070:ci-postgres' }),
    'confirmed-non-local'
  );
  assert.throws(
    () =>
      assertSeedTargetAllowed({
        DATABASE_URL: direct('abcdefghijklmnopqrst'),
        SEED_TARGET_CONFIRM: `plan070:${staging}`,
      }),
    /non-local-unconfirmed$/
  );
});

test('errors disclose only classification, never target or credentials', () => {
  for (const DATABASE_URL of [direct(production), pooled(staging), 'credential-CANARY']) {
    assert.throws(
      () => assertSeedTargetAllowed({ DATABASE_URL }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(
          error.message,
          /^Seed target refused: (production|non-local-unconfirmed|invalid)$/
        );
        assert.ok(!error.message.includes('CANARY'));
        return true;
      }
    );
  }
});

test('container seed callers pass fixed confirmations rather than deriving approval from the DB URL', () => {
  const read = (file: string) =>
    readFileSync(new URL(`../../../scripts/${file}`, import.meta.url), 'utf8');
  assert.match(
    read('docker-run.sh'),
    /-e "SEED_TARGET_CONFIRM=\$\{SEED_TARGET_CONFIRM:-plan070:host\.docker\.internal\}"/
  );
  for (const file of ['docker-gate.sh', 'safe-gate.sh']) {
    const source = read(file);
    assert.equal(source.split('plan070:host.docker.internal').length - 1, 2);
    assert.match(source, /seed:e2e/);
    assert.match(source, /seed:assert-e2e/);
  }
  assert.match(read('ci-local-parity.sh'), /d SEED_TARGET_CONFIRM plan070:ci-postgres/);
  const m4 = read('m4-gatekeeper.sh');
  assert.ok(m4.indexOf('--check-target') < m4.indexOf('pnpm seed:e2e'));
});

test('runner and assertion preflight precede DB initialization', () => {
  for (const [file, entry] of [
    ['seed.ts', 'main'],
    ['seed-assert.ts', 'assertSeed'],
  ]) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.match(
      source,
      new RegExp(`async function ${entry}\\(\\) \\{\\s*assertSeedTargetAllowed\\(process.env\\);`)
    );
    assert.ok(
      source.indexOf('assertSeedTargetAllowed(process.env)') <
        source.indexOf("await import('./db')")
    );
    assert.ok(!source.includes('SEED_ALLOW_RESET'));
  }
});

test('exported golden, full, workload and agent-pack entry points preflight first', () => {
  const entries = [
    ['seed-golden/index.ts', 'seedGolden'],
    ['seed-full/index.ts', 'seedFull'],
    ['seed-workload/index.ts', 'seedWorkload'],
    ['seed-packs/agent-pack.ts', 'seedAgentPack'],
  ];
  for (const [file, entry] of entries) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.match(
      source,
      new RegExp(
        `export async function ${entry}\\(config: SeedConfig\\) \\{\\s*assertSeedTargetAllowed\\(process.env\\);`
      )
    );
  }
});
