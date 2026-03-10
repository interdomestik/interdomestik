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

  assert.match(gateScript, /validate_gate_cache_mode\(\)/);
  assert.match(gateScript, /ERROR: DOCKER_GATE_CACHE_MODE must be 'ephemeral' or 'warm'\./);
  assert.match(gateScript, /GATE_INFRA_SERVICES=\(redis mailpit minio\)/);
  assert.match(gateScript, /docker compose --profile gate up -d "\$\{GATE_INFRA_SERVICES\[@\]\}"/);
  assert.match(gateScript, /docker compose --profile gate run --rm --no-deps createbuckets/);
  assert.doesNotMatch(gateScript, /docker compose --profile gate run --rm --no-deps createbuckets >\/dev\/null/);
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

test('docker gate uses bounded cache policy and exposes explicit warm-cache opt-in', () => {
  const gateScript = readRepoFile('scripts/docker-gate.sh');
  const reclaimScript = readRepoFile('scripts/docker-reclaim.sh');
  const packageJson = JSON.parse(readRepoFile('package.json'));

  assert.match(gateScript, /DOCKER_GATE_CACHE_MODE="\$\{DOCKER_GATE_CACHE_MODE:-ephemeral\}"/);
  assert.match(gateScript, /Gate cache mode:/);
  assert.match(reclaimScript, /DOCKER_GATE_CACHE_MODE="\$\{DOCKER_GATE_CACHE_MODE:-ephemeral\}"/);
  assert.match(
    reclaimScript,
    /\*playwright_pnpm_store\|\*playwright_root_node_modules\|\*playwright_web_node_modules/
  );
  assert.match(reclaimScript, /DOCKER_RECLAIM_SOFT_LIMIT_GB="\$\{DOCKER_RECLAIM_SOFT_LIMIT_GB:-20\}"/);
  assert.match(reclaimScript, /docker system df --format '\{\{json \.\}\}'/);
  assert.equal(packageJson.scripts['docker:gate:warm'], 'DOCKER_GATE_CACHE_MODE=warm DOCKER_GATE_RECLAIM=1 bash scripts/docker-gate.sh');
});

test('docker compose avoids fixed container names and allows worktree-safe port overrides', () => {
  const compose = readRepoFile('docker-compose.yml');
  const gateScript = readRepoFile('scripts/docker-gate.sh');
  const startSystemScript = readRepoFile('scripts/start-system.sh');
  const devUpScript = readRepoFile('scripts/docker-dev-up.sh');
  const composeLines = compose.split('\n');

  assert.equal(composeLines.some(line => line.trimStart().startsWith('container_name:')), false);
  assert.match(compose, /- '\$\{DOCKER_WEB_PORT:-3000\}:3000'/);
  assert.match(compose, /- '\$\{DOCKER_REDIS_PORT:-6379\}:6379'/);
  assert.match(compose, /- '\$\{DOCKER_SMTP_PORT:-1025\}:1025'/);
  assert.match(compose, /- '\$\{DOCKER_MAILPIT_UI_PORT:-8025\}:8025'/);
  assert.match(compose, /- '\$\{DOCKER_MINIO_API_PORT:-9000\}:9000'/);
  assert.match(compose, /- '\$\{DOCKER_MINIO_CONSOLE_PORT:-9001\}:9001'/);
  assert.match(compose, /http:\/\/127\.0\.0\.1\.nip\.io:\$\{DOCKER_WEB_PORT:-3000\}/);
  assert.match(compose, /http:\/\/localhost:\$\{DOCKER_MINIO_API_PORT:-9000\}/);
  assert.match(gateScript, /DOCKER_WEB_PORT="\$\{DOCKER_WEB_PORT:-3000\}"/);
  assert.match(gateScript, /GATE_WEB_READY_URL="\$\{GATE_WEB_READY_URL:-http:\/\/127\.0\.0\.1:\$\{DOCKER_WEB_PORT\}\/robots\.txt\}"/);
  assert.match(startSystemScript, /http:\/\/localhost:\$\{DOCKER_WEB_PORT:-3000\}/);
  assert.match(devUpScript, /⏳ Waiting for MinIO and provisioning buckets\.\.\./);
  assert.doesNotMatch(devUpScript, /docker compose --profile infra run --rm --no-deps createbuckets >\/dev\/null/);
  assert.match(devUpScript, /http:\/\/localhost:\$\{DOCKER_MAILPIT_UI_PORT:-8025\}/);
});

test('createbuckets waits for MinIO readiness before creating the claim-evidence bucket', () => {
  const compose = readRepoFile('docker-compose.yml');

  assert.match(compose, /createbuckets:[\s\S]*profiles: \['infra', 'gate'\]/);
  assert.ok(compose.includes('MAX_ATTEMPTS=30;'));
  assert.ok(compose.includes('ATTEMPT=1;'));
  assert.ok(compose.includes('while [ \\"$$ATTEMPT\\" -le \\"$$MAX_ATTEMPTS\\" ]; do'));
  assert.ok(compose.includes('Waiting for MinIO to accept connections... (attempt $$ATTEMPT/$$MAX_ATTEMPTS)'));
  assert.ok(
    compose.includes(
      'ERROR: Timed out waiting for MinIO to accept connections after $$MAX_ATTEMPTS attempts (about $$((MAX_ATTEMPTS * SLEEP_INTERVAL)) seconds).'
    )
  );
  assert.match(compose, /\/usr\/bin\/mc mb -p myminio\/claim-evidence >\/dev\/null 2>&1 \|\| true;/);
  assert.match(compose, /\/usr\/bin\/mc anonymous set public myminio\/claim-evidence >/);
});

test('docker reclaim parses docker system df output safely across chunk boundaries', () => {
  const reclaimScript = readRepoFile('scripts/docker-reclaim.sh');

  assert.match(reclaimScript, /let buffer = "";/);
  assert.match(reclaimScript, /process\.stdin\.setEncoding\("utf8"\);/);
  assert.match(reclaimScript, /const lines = buffer\.split\(\/\\\\r\?\\\\n\/\);/);
  assert.match(reclaimScript, /buffer = lines\.pop\(\) \?\? "";/);
  assert.match(reclaimScript, /try \{/);
  assert.match(reclaimScript, /process\.stdin\.on\("end", \(\) => \{/);
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
  assert.match(dockerfile, /ARG INTERDOMESTIK_DEPLOY_ENV/);
  assert.match(dockerfile, /ENV INTERDOMESTIK_DEPLOY_ENV=\$INTERDOMESTIK_DEPLOY_ENV/);
  assert.match(dockerfile, /ARG SUPABASE_PRODUCTION_PROJECT_REF/);
  assert.match(
    dockerfile,
    /ENV SUPABASE_PRODUCTION_PROJECT_REF=\$SUPABASE_PRODUCTION_PROJECT_REF/
  );
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
