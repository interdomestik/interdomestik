import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function listLines(content) {
  return content.split('\n').map(line => line.replace(/\r$/, ''));
}

function assertLineAbsent(content, expectedLine) {
  assert.ok(
    !listLines(content).some(line => line.trim() === expectedLine),
    `Expected file to omit line: ${expectedLine}`
  );
}

function resolveSystemBash() {
  for (const candidate of ['/bin/bash', '/usr/bin/bash']) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('Expected bash to exist at a fixed system path');
}

test('playwright compose service uses stable named caches instead of throwaway anonymous volumes', () => {
  const compose = readRepoFile('docker-compose.yml');

  assert.match(compose, /playwright_pnpm_store:\s*\/pnpm-store/);
  assert.match(compose, /playwright_root_node_modules:\s*\/app\/node_modules/);
  assert.match(compose, /playwright_web_node_modules:\s*\/app\/apps\/web\/node_modules/);
  assertLineAbsent(compose, '- /app/node_modules');
  assertLineAbsent(compose, '- /app/apps/web/node_modules');
  assertLineAbsent(compose, '- /app/apps/web/.next');
  assert.doesNotMatch(compose, /playwright_web_next:\s*\/app\/apps\/web\/\.next/);
  assertLineAbsent(compose, 'playwright_web_next:');
});

test('docker gate scripts avoid redundant playwright startup and reuse the same runner container shape', () => {
  const gateScript = readRepoFile('scripts/docker-gate.sh');
  const runScript = readRepoFile('scripts/docker-run.sh');
  const reclaimScript = readRepoFile('scripts/docker-reclaim.sh');

  assert.match(gateScript, /GATE_INFRA_SERVICES=\(redis mailpit minio createbuckets\)/);
  assert.match(gateScript, /docker compose --profile gate up -d "\$\{GATE_INFRA_SERVICES\[@\]\}"/);
  assert.match(gateScript, /docker compose --profile gate up -d web/);
  assert.match(gateScript, /GATE_WEB_READY_URL=/);
  assert.match(gateScript, /curl --fail --silent --output \/dev\/null "\$\{GATE_WEB_READY_URL\}"/);
  assert.match(gateScript, /MAX_WEB_READY_ATTEMPTS=/);
  assert.match(runScript, /compose run --rm --no-deps/);
  assert.match(reclaimScript, /remove_gate_cache_volumes/);
  assert.match(reclaimScript, /prune_builder_gate/);
  assert.match(reclaimScript, /buildx prune -f --filter "until=24h"/);
  assert.match(reclaimScript, /gate\)[\s\S]*prune_builder_gate/);
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
  assert.match(compose, /NEXT_PUBLIC_SUPABASE_URL: \$\{DOCKER_GATE_SUPABASE_URL:-http:\/\/localhost:54321\}/);
  assert.match(compose, /NEXT_PUBLIC_SUPABASE_ANON_KEY: \$\{NEXT_PUBLIC_SUPABASE_ANON_KEY\}/);
  assert.match(compose, /- NEXT_PUBLIC_SUPABASE_URL=\$\{DOCKER_GATE_SUPABASE_URL:-http:\/\/localhost:54321\}/);
  assert.match(compose, /- NEXT_PUBLIC_SUPABASE_ANON_KEY=\$\{NEXT_PUBLIC_SUPABASE_ANON_KEY\}/);
});

test('full startup script is valid bash', () => {
  execFileSync(resolveSystemBash(), ['-n', path.join(rootDir, 'scripts/start-system.sh')], {
    cwd: rootDir,
    stdio: 'pipe',
  });
});
