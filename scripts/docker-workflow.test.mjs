import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const rootDir = path.resolve(import.meta.dirname, '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('playwright compose service uses stable named caches instead of throwaway anonymous volumes', () => {
  const compose = readRepoFile('docker-compose.yml');

  assert.match(compose, /playwright_pnpm_store:\s*\/pnpm-store/);
  assert.match(compose, /playwright_root_node_modules:\s*\/app\/node_modules/);
  assert.match(compose, /playwright_web_node_modules:\s*\/app\/apps\/web\/node_modules/);
  assert.doesNotMatch(compose, /^\s*-\s*\/app\/node_modules\s*$/m);
  assert.doesNotMatch(compose, /^\s*-\s*\/app\/apps\/web\/node_modules\s*$/m);
  assert.doesNotMatch(compose, /^\s*-\s*\/app\/apps\/web\/\.next\s*$/m);
  assert.doesNotMatch(compose, /playwright_web_next:\s*\/app\/apps\/web\/\.next/);
  assert.doesNotMatch(compose, /^playwright_web_next:\s*$/m);
});

test('docker gate scripts avoid redundant playwright startup and reuse the same runner container shape', () => {
  const gateScript = readRepoFile('scripts/docker-gate.sh');
  const runScript = readRepoFile('scripts/docker-run.sh');
  const reclaimScript = readRepoFile('scripts/docker-reclaim.sh');

  assert.match(gateScript, /GATE_INFRA_SERVICES=\(redis mailpit minio createbuckets\)/);
  assert.match(gateScript, /docker compose --profile gate up -d "\$\{GATE_INFRA_SERVICES\[@\]\}"/);
  assert.match(gateScript, /docker compose --profile gate up -d web/);
  assert.match(gateScript, /MAX_WEB_READY_ATTEMPTS=/);
  assert.match(runScript, /compose run --rm --no-deps/);
  assert.match(reclaimScript, /remove_gate_cache_volumes/);
  assert.doesNotMatch(reclaimScript, /buildx prune -f --filter 'until=24h'/);
});

test('docker gate reuses the external web service instead of rebuilding inside Playwright', () => {
  const gateScript = readRepoFile('scripts/docker-gate.sh');
  const playwrightConfig = readRepoFile('apps/web/playwright.config.ts');

  assert.match(gateScript, /PW_EXTERNAL_SERVER=1 .*pnpm --filter @interdomestik\/web test:smoke/);
  assert.match(playwrightConfig, /const useExternalWebServer = process\.env\.PW_EXTERNAL_SERVER === '1';/);
  assert.match(playwrightConfig, /webServer:\s*useExternalWebServer\s*\?\s*undefined\s*:\s*\{/);
});

test('web docker path injects public Supabase client env into the browser build and runtime', () => {
  const compose = readRepoFile('docker-compose.yml');
  const dockerfile = readRepoFile('apps/web/Dockerfile');

  assert.match(dockerfile, /ARG NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(dockerfile, /ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=\$NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(compose, /NEXT_PUBLIC_SUPABASE_ANON_KEY: \$\{NEXT_PUBLIC_SUPABASE_ANON_KEY\}/);
  assert.match(compose, /- NEXT_PUBLIC_SUPABASE_ANON_KEY=\$\{NEXT_PUBLIC_SUPABASE_ANON_KEY\}/);
});

test('full startup script is valid bash', () => {
  execFileSync('bash', ['-n', path.join(rootDir, 'scripts/start-system.sh')], {
    cwd: rootDir,
    stdio: 'pipe',
  });
});
