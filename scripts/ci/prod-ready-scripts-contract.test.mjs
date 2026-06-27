import assert from 'node:assert/strict';
import test from 'node:test';

import packageJson from '../../package.json' with { type: 'json' };

test('production code readiness gate stays Docker-free', () => {
  const script = packageJson.scripts['prod:ready:code'];

  assert.match(script, /\bpnpm type-check\b/);
  assert.match(script, /\bpnpm lint\b/);
  assert.match(script, /pnpm --filter @interdomestik\/web test:unit --run/);
  assert.match(script, /\bpnpm check:architecture-boundaries\b/);
  assert.match(script, /\bpnpm check:db-access\b/);
  assert.match(script, /\bpnpm i18n:check\b/);
  assert.match(script, /\bpnpm repo:size:check\b/);
  assert.doesNotMatch(script, /\bdocker\b|\bsupabase\b|\be2e\b|\brelease:gate\b/);
});

test('production gate runs the human evidence check first', () => {
  assert.equal(packageJson.scripts['release:evidence:check'], 'node scripts/release-evidence-check.mjs');
  assert.match(packageJson.scripts['release:gate:prod'], /^pnpm release:evidence:check && /);
});

test('e2e lane runner calls doctor before the gatekeeper', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../run-e2e-lane.mjs', import.meta.url), 'utf8');
  const doctorIndex = source.indexOf("await run('pnpm', ['run', 'doctor'], laneEnv)");
  const gatekeeperIndex = source.indexOf("await run('bash', ['scripts/m4-gatekeeper.sh'], laneEnv)");

  assert.ok(doctorIndex > 0);
  assert.ok(gatekeeperIndex > doctorIndex);
});
