import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const config = readFileSync(
  new URL('../../apps/web/playwright.config.ts', import.meta.url),
  'utf8'
);
const SENSITIVE = /SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE|CREDENTIAL/iu;
const ALLOWED_SPREADS = new Set(['restrictedServerEnv']);

// The JSON reporter serializes webServer.env into uploaded report artifacts.
function assertReportSafeEnv(block) {
  const lines = block
    .split('\n')
    .map(line => line.replace(/\/\/.*$/u, '').trim())
    .filter(Boolean);
  for (const line of lines) {
    const spread = line.match(/^\.\.\.\s*([\w.]+)/u);
    if (spread) {
      assert.ok(ALLOWED_SPREADS.has(spread[1]), `unexpected env spread: ${line}`);
      continue;
    }
    assert.doesNotMatch(
      line,
      /process\s*\.\s*env\s*(?:\.|\[)\s*['"]?\w*(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE|CREDENTIAL)/iu
    );
    const key = line.match(/^['"]?(\w+)['"]?\s*:/u)?.[1];
    if (key && SENSITIVE.test(key)) {
      assert.match(line, /:\s*(?:''|"")\s*,?$/u, `${key} may only be cleared with ''`);
    }
  }
}

test('Playwright webServer env keeps secrets out of serialized JSON reports', () => {
  const match = config.match(/\bwebServer:[\s\S]*?\benv:\s*\{([\s\S]*?)^ {8}\},/mu);
  assert.ok(match, 'webServer env block must be found');
  assert.match(match[1], /NODE_ENV:/u, 'env block extraction must reach the overrides');
  assertReportSafeEnv(match[1]);
});

test('report env contract rejects inherited spreads and sensitive values', () => {
  const unsafe = [
    '...process.env,',
    '...extraEnv,',
    "BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? '',",
    "SAFE_VALUE: process.env['PADDLE_WEBHOOK_SECRET_KEY'],",
    'SERVICE_TOKEN: "fixture",',
    'API_KEY: value,',
    'PRIVATE_KEY: `x`,',
  ];
  for (const block of unsafe) {
    assert.throws(() => assertReportSafeEnv(block), assert.AssertionError, block);
  }
  assert.doesNotThrow(() =>
    assertReportSafeEnv(
      "UPSTASH_REDIS_REST_TOKEN: '',\n...restrictedServerEnv,\nPORT: String(PORT),"
    )
  );
});
