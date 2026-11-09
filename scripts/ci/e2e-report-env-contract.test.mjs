import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const WEB_DIR = fileURLToPath(new URL('../../apps/web/', import.meta.url));
const RUNTIME_URL =
  'postgresql://app_runtime:canary-runtime-pass@127.0.0.1:5432/interdomestik_test';
// Credential-bearing inputs of the E2E lanes, plus an unlisted name that only a spread can copy.
const CANARIES = {
  ZZ_UNLISTED_INHERITED: 'canary-unlisted',
  BETTER_AUTH_SECRET: 'canary-auth-secret-0123456789abcdef',
  PADDLE_API_KEY: 'canary-paddle-api',
  PADDLE_WEBHOOK_SECRET_KEY: 'canary-paddle-webhook',
  DATABASE_URL: 'postgresql://setup:canary-db-pass@127.0.0.1:5432/interdomestik_test',
  E2E_DATABASE_URL: 'postgresql://setup:canary-e2e-pass@127.0.0.1:5432/interdomestik_test',
  E2E_DATABASE_URL_RLS: 'postgresql://setup:canary-e2e-rls-pass@127.0.0.1:5432/interdomestik_test',
  E2E_SERVER_DATABASE_URL_RLS: RUNTIME_URL,
  E2E_PASSWORD: 'canary-e2e-password',
  E2E_API_SECRET: 'canary-e2e-api-secret',
  OTP_RATE_LIMIT_HMAC_SECRET: 'canary-otp-secret',
  GH_LOOKUP_TOKEN: 'canary-gh-token',
};
const CANARY_PART = /canary-[\w-]+/u;
const SECRET_PARTS = Object.values(CANARIES).map(value => CANARY_PART.exec(value)[0]);
// Loads a config the way the JSON reporter receives it and prints only which canaries leaked.
const PROBE = `
const loaded = await import(process.argv[1]);
const config = loaded.default?.default ?? loaded.default;
const serialized = JSON.stringify(config);
const secrets = JSON.parse(process.env.REPORT_PROBE_SECRETS);
console.log('REPORT_PROBE ' + JSON.stringify({
  command: config.webServer?.command ?? null,
  envKeys: Object.keys(config.webServer?.env ?? {}),
  leaked: secrets.filter(secret => serialized.includes(secret)),
}));`;

function probe(configPath) {
  const env = { ...process.env, ...CANARIES, REPORT_PROBE_SECRETS: JSON.stringify(SECRET_PARTS) };
  // An inherited value wins over .env files, so a local .env cannot switch to an external server.
  env.PW_EXTERNAL_SERVER = '0';
  const run = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', PROBE, configPath],
    { cwd: WEB_DIR, env, encoding: 'utf8' }
  );
  const line = run.stdout.split('\n').find(entry => entry.startsWith('REPORT_PROBE '));
  assert.ok(line, `probe produced no result (exit ${run.status})`);
  return JSON.parse(line.slice('REPORT_PROBE '.length));
}

test('serialized Playwright config carries no lane credentials', () => {
  const result = probe(path.join(WEB_DIR, 'playwright.config.ts'));
  assert.ok(result.envKeys.includes('NODE_ENV'), 'webServer env must be evaluated');
  assert.deepEqual(result.leaked, []);
  const shell = spawnSync(
    'sh',
    ['-c', `${result.command.split('bash ')[0]}printenv DATABASE_URL_RLS`],
    {
      // Synthetic environment only, so a failure can never echo an inherited credential.
      env: { PATH: process.env.PATH, E2E_SERVER_DATABASE_URL_RLS: RUNTIME_URL },
      encoding: 'utf8',
    }
  );
  assert.ok(shell.stdout.trim() === RUNTIME_URL, 'server prefix must still pass the runtime role');
});

test('probe detects spread, wrapped and direct credential forms', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-env-probe-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const forms = [
    '...process.env',
    '...(process.env)',
    '...{ ...process.env }',
    'DATABASE_URL: process.env.DATABASE_URL',
    'BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET',
  ];
  forms.forEach((form, index) => {
    const file = path.join(dir, `unsafe-${index}.mjs`);
    fs.writeFileSync(
      file,
      `export default { webServer: { command: 'bash x', env: { NODE_ENV: 'production', ${form} } } };\n`
    );
    assert.notDeepEqual(probe(file).leaked, [], form);
  });
});
