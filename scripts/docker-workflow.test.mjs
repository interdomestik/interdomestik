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
  assert.doesNotMatch(
    gateScript,
    /docker compose --profile gate run --rm --no-deps createbuckets >\/dev\/null/
  );
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
  assert.match(
    reclaimScript,
    /DOCKER_RECLAIM_SOFT_LIMIT_GB="\$\{DOCKER_RECLAIM_SOFT_LIMIT_GB:-20\}"/
  );
  assert.match(reclaimScript, /docker system df --format '\{\{json \.\}\}'/);
  assert.equal(
    packageJson.scripts['docker:gate:warm'],
    'DOCKER_GATE_CACHE_MODE=warm DOCKER_GATE_RECLAIM=1 bash scripts/docker-gate.sh'
  );
});

test('local CI parity runner mirrors required PR gate surfaces in Docker', () => {
  const compose = readRepoFile('docker-compose.yml');
  const parityScript = readRepoFile('scripts/ci-local-parity.sh');
  const packageJson = JSON.parse(readRepoFile('package.json'));
  const dockerfile = readRepoFile('docker/Dockerfile.ci-parity');
  const sonarScan = readRepoFile('scripts/sonar-scan.mjs');

  assert.equal(packageJson.scripts['ci:local:quick'], 'bash scripts/ci-local-parity.sh quick');
  assert.equal(packageJson.scripts['ci:local:pr'], 'bash scripts/ci-local-parity.sh pr');
  assert.equal(packageJson.scripts['ci:local:full'], 'bash scripts/ci-local-parity.sh full');
  assert.equal(
    packageJson.scripts['ci:local:sonar'],
    'node scripts/run-with-dotenv.mjs bash scripts/ci-local-parity.sh sonar'
  );
  assert.equal(
    packageJson.scripts['ci:local:sonar:pr'],
    'node scripts/run-with-dotenv.mjs bash scripts/ci-local-parity.sh sonar-pr'
  );
  assert.equal(
    packageJson.scripts['ci:local:ready'],
    'node scripts/run-with-dotenv.mjs bash scripts/ci-local-parity.sh ready'
  );
  assert.equal(packageJson.scripts['ci:local:clean'], 'bash scripts/ci-local-parity.sh clean');

  assert.match(dockerfile, /FROM node:24-bookworm/);
  assert.match(dockerfile, /ARG GITLEAKS_VERSION=8\.30\.0/);
  assert.match(dockerfile, /gitleaks_\$\{GITLEAKS_VERSION\}_linux_x64\.tar\.gz/);
  assert.match(dockerfile, /install \/tmp\/gitleaks \/usr\/local\/bin\/gitleaks/);
  assert.match(dockerfile, /corepack prepare pnpm@10\.28\.2 --activate/);
  assert.match(dockerfile, /playwright@1\.60\.0 -- install-deps chromium/);
  assert.match(dockerfile, /postgresql-client/);
  assert.match(dockerfile, /ripgrep/);
  assert.match(dockerfile, /unzip/);
  assert.match(dockerfile, /\/home\/node\/\.sonar/);

  assert.match(compose, /ci-postgres:[\s\S]*image: postgres:16/);
  assert.match(compose, /ci-parity:[\s\S]*dockerfile: docker\/Dockerfile\.ci-parity/);
  assert.match(compose, /ci_local_pnpm_store:\s*\/pnpm-store/);
  assert.match(compose, /ci_local_root_node_modules:\s*\/workspace\/node_modules/);
  assert.match(compose, /ci_local_web_node_modules:\s*\/workspace\/apps\/web\/node_modules/);
  assert.match(compose, /ci_local_playwright_cache:\s*\/home\/node\/\.cache\/ms-playwright/);
  assert.match(compose, /ci_local_turbo_cache:\s*\/home\/node\/\.cache\/turbo/);
  assert.match(compose, /ci_local_sonar_cache:\s*\/home\/node\/\.sonar/);
  assert.match(
    compose,
    /\$\{CI_LOCAL_GIT_DIR:-\.git\}:\$\{CI_LOCAL_GIT_DIR:-\/workspace\/\.git\}:ro/
  );
  assert.match(
    compose,
    /\$\{CI_LOCAL_GIT_COMMON_DIR:-\.git\}:\$\{CI_LOCAL_GIT_COMMON_DIR:-\/workspace\/\.git\}:ro/
  );
  assert.match(
    compose,
    /DATABASE_URL: postgresql:\/\/postgres:postgres@ci-postgres:5432\/interdomestik_test/
  );
  assert.match(compose, /QA_MCP_CONTRACT_TIMEOUT_MS: '30000'/);
  assert.match(compose, /CI_LOCAL_PR_NUMBER: \$\{CI_LOCAL_PR_NUMBER:-\}/);
  assert.match(compose, /CI_LOCAL_BASE_REF: \$\{CI_LOCAL_BASE_REF:-origin\/main\}/);
  assert.match(compose, /CI_LOCAL_BASE_SHA: \$\{CI_LOCAL_BASE_SHA:-\}/);
  assert.match(compose, /CI_LOCAL_HEAD_SHA: \$\{CI_LOCAL_HEAD_SHA:-\}/);
  assert.match(compose, /TURBO_CACHE_DIR: \/home\/node\/\.cache\/turbo/);
  assert.match(compose, /SONAR_HOST_URL: \$\{SONAR_HOST_URL:-http:\/\/sonarqube:9000\}/);
  assert.match(compose, /SONAR_PROJECT_KEY: \$\{SONAR_PROJECT_KEY:-interdomestik\}/);
  assert.match(compose, /SONAR_TOKEN: \$\{SONAR_TOKEN:-\}/);
  assert.match(compose, /SONAR_SCANNER_FORCE_NATIVE: \$\{SONAR_SCANNER_FORCE_NATIVE:-true\}/);
  assert.match(compose, /SONAR_USER_HOME: \/home\/node\/\.sonar/);

  assert.match(parityScript, /pnpm test:ci:contracts/);
  assert.match(parityScript, /detect_pull_request_context\(\)/);
  assert.match(parityScript, /SONAR_PULLREQUEST_KEY="\$\{CI_LOCAL_PR_NUMBER\}"/);
  assert.match(parityScript, /export_default_git_context\(\)/);
  assert.match(parityScript, /run_host_pr_finalizer_if_available\(\)/);
  assert.match(parityScript, /PR_FINALIZER_SKIP_CHECK_POLLING=false/);
  assert.match(parityScript, /run_validation_surface_check\(\)/);
  assert.match(parityScript, /validation-surface-policy\.mjs --event-name pull_request/);
  assert.match(parityScript, /git rev-parse --git-dir/);
  assert.doesNotMatch(parityScript, /export GIT_DIR/);
  assert.match(parityScript, /node scripts\/ci\/reviewer-preflight\.mjs/);
  assert.match(parityScript, /pnpm repo:size:check/);
  assert.match(parityScript, /pnpm exec commitlint --from/);
  assert.match(parityScript, /gitleaks git --redact --log-opts/);
  assert.match(parityScript, /run_github_edge_checks\(\)/);
  assert.match(parityScript, /pnpm check:e2e-contracts:base/);
  assert.match(parityScript, /pnpm lint:production-warnings/);
  assert.match(parityScript, /pnpm db:migrations:check-journal/);
  assert.match(parityScript, /pnpm check:e2e-quarantine-budget/);
  assert.match(parityScript, /pnpm -w lint/);
  assert.match(parityScript, /pnpm -w type-check/);
  assert.match(parityScript, /pnpm coverage:gate/);
  assert.match(parityScript, /pnpm db:rls:test:required/);
  assert.match(parityScript, /pnpm e2e:gate:pr/);
  assert.match(parityScript, /pnpm -s release:gate:p0:raw --baseUrl http:\/\/127\.0\.0\.1:3000/);
  assert.match(parityScript, /pnpm security:guard/);
  assert.match(parityScript, /pnpm audit --prod --audit-level=high --json/);
  assert.match(parityScript, /node scripts\/pnpm-audit-gate\.mjs \/tmp\/pnpm-audit\.json/);
  assert.match(parityScript, /pnpm e2e:gate/);
  assert.match(parityScript, /ensure_sonar_server_ready\(\)/);
  assert.match(parityScript, /api\/system\/status/);
  assert.match(parityScript, /pnpm sonar:start/);
  assert.match(parityScript, /run_sonar_checks\(\)/);
  assert.match(parityScript, /pnpm sonar:gate/);
  assert.match(parityScript, /run_optional_sonar_pr_checks\(\)/);
  assert.match(parityScript, /Skipping Sonar PR parity because SONAR_TOKEN is not set/);
  assert.match(parityScript, /SONAR_RUN_COVERAGE.*true/);
  assert.match(parityScript, /SONAR_SCANNER_FORCE_NATIVE/);
  assert.match(parityScript, /NEXT_PUBLIC_BILLING_TEST_MODE=0/);

  assert.match(sonarScan, /SONAR_SCANNER_FORCE_NATIVE/);
  assert.match(sonarScan, /shouldUseNativeScanner/);
  assert.match(sonarScan, /statusUrl: forceNative/);
  assert.match(sonarScan, /if \(forceNative\) \{\s*process\.exit\(nativeStatus \|\| 1\);/);
});

test('QA MCP contract timeout override falls back for invalid values', () => {
  const qaContract = readRepoFile('scripts/ci/qa-mcp-discovery-contracts.test.mjs');

  assert.match(qaContract, /function parsePositiveTimeout\(value, fallback\)/);
  assert.match(qaContract, /Number\.isFinite\(parsed\) && parsed > 0/);
  assert.match(
    qaContract,
    /parsePositiveTimeout\(\s*process\.env\.QA_MCP_CONTRACT_TIMEOUT_MS,\s*10000\s*\)/m
  );
});

test('docker compose avoids fixed container names and allows worktree-safe port overrides', () => {
  const compose = readRepoFile('docker-compose.yml');
  const gateScript = readRepoFile('scripts/docker-gate.sh');
  const startSystemScript = readRepoFile('scripts/start-system.sh');
  const devUpScript = readRepoFile('scripts/docker-dev-up.sh');
  const composeLines = compose.split('\n');

  assert.equal(
    composeLines.some(line => line.trimStart().startsWith('container_name:')),
    false
  );
  assert.match(compose, /- '\$\{DOCKER_WEB_PORT:-3000\}:3000'/);
  assert.match(compose, /- '\$\{DOCKER_REDIS_PORT:-6379\}:6379'/);
  assert.match(compose, /- '\$\{DOCKER_SMTP_PORT:-1025\}:1025'/);
  assert.match(compose, /- '\$\{DOCKER_MAILPIT_UI_PORT:-8025\}:8025'/);
  assert.match(compose, /- '\$\{DOCKER_MINIO_API_PORT:-9000\}:9000'/);
  assert.match(compose, /- '\$\{DOCKER_MINIO_CONSOLE_PORT:-9001\}:9001'/);
  assert.match(compose, /http:\/\/127\.0\.0\.1\.nip\.io:\$\{DOCKER_WEB_PORT:-3000\}/);
  assert.match(compose, /http:\/\/localhost:\$\{DOCKER_MINIO_API_PORT:-9000\}/);
  assert.match(gateScript, /DOCKER_WEB_PORT="\$\{DOCKER_WEB_PORT:-3000\}"/);
  assert.match(
    gateScript,
    /GATE_WEB_READY_URL="\$\{GATE_WEB_READY_URL:-http:\/\/127\.0\.0\.1:\$\{DOCKER_WEB_PORT\}\/robots\.txt\}"/
  );
  assert.match(startSystemScript, /http:\/\/localhost:\$\{DOCKER_WEB_PORT:-3000\}/);
  assert.match(devUpScript, /⏳ Waiting for MinIO and provisioning buckets\.\.\./);
  assert.doesNotMatch(
    devUpScript,
    /docker compose --profile infra run --rm --no-deps createbuckets >\/dev\/null/
  );
  assert.match(devUpScript, /http:\/\/localhost:\$\{DOCKER_MAILPIT_UI_PORT:-8025\}/);
});

test('createbuckets waits for MinIO readiness before creating the claim-evidence bucket', () => {
  const compose = readRepoFile('docker-compose.yml');

  assert.match(compose, /createbuckets:[\s\S]*profiles: \['infra', 'gate'\]/);
  assert.ok(compose.includes('MAX_ATTEMPTS=30;'));
  assert.ok(compose.includes('ATTEMPT=1;'));
  assert.ok(compose.includes(String.raw`while [ \"$$ATTEMPT\" -le \"$$MAX_ATTEMPTS\" ]; do`));
  assert.ok(
    compose.includes(
      'Waiting for MinIO to accept connections... (attempt $$ATTEMPT/$$MAX_ATTEMPTS)'
    )
  );
  assert.ok(
    compose.includes(
      'ERROR: Timed out waiting for MinIO to accept connections after $$MAX_ATTEMPTS attempts (about $$((MAX_ATTEMPTS * SLEEP_INTERVAL)) seconds).'
    )
  );
  assert.match(
    compose,
    /\/usr\/bin\/mc mb -p myminio\/claim-evidence >\/dev\/null 2>&1 \|\| true;/
  );
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
  assert.match(
    playwrightConfig,
    /const useExternalWebServer = process\.env\.PW_EXTERNAL_SERVER === '1';/
  );
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
  assert.match(dockerfile, /ENV SUPABASE_PRODUCTION_PROJECT_REF=\$SUPABASE_PRODUCTION_PROJECT_REF/);
  assert.match(
    compose,
    /NEXT_PUBLIC_SUPABASE_URL: \$\{DOCKER_GATE_SUPABASE_URL:-http:\/\/localhost:54321\}/
  );
  assert.match(compose, /NEXT_PUBLIC_SUPABASE_ANON_KEY: \$\{NEXT_PUBLIC_SUPABASE_ANON_KEY\}/);
  assert.match(
    compose,
    /- NEXT_PUBLIC_SUPABASE_URL=\$\{DOCKER_GATE_SUPABASE_URL:-http:\/\/localhost:54321\}/
  );
  assert.match(compose, /- NEXT_PUBLIC_SUPABASE_ANON_KEY=\$\{NEXT_PUBLIC_SUPABASE_ANON_KEY\}/);
});

test('full startup script is valid bash', () => {
  execFileSync(resolveSystemBash(), ['-n', path.join(rootDir, 'scripts/start-system.sh')], {
    cwd: rootDir,
    stdio: 'pipe',
  });
});
