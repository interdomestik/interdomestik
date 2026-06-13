import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readPackageJson() {
  return JSON.parse(readRepoFile('package.json'));
}

test('local CI parity commands use the low-disk wrapper by default', () => {
  const { scripts } = readPackageJson();

  assert.equal(scripts['ci:local:quick'], 'bash scripts/ci-local-lowdisk.sh quick');
  assert.equal(scripts['ci:local:pr'], 'bash scripts/ci-local-lowdisk.sh pr');
  assert.equal(scripts['ci:local:full'], 'bash scripts/ci-local-lowdisk.sh full');
  assert.equal(scripts['ci:local:clean'], 'bash scripts/ci-local-parity.sh clean');
  assert.equal(scripts['ci:local:quick:lowdisk'], undefined);
  assert.equal(scripts['ci:local:pr:lowdisk'], undefined);
  assert.equal(scripts['ci:local:full:lowdisk'], undefined);
});

test('Docker gate defaults to bounded cache and reclaim behavior', () => {
  const { scripts } = readPackageJson();

  assert.equal(scripts['docker:infra:up'], 'bash scripts/docker-dev-up.sh');
  assert.equal(
    scripts['docker:gate'],
    'DOCKER_GATE_CACHE_MODE=ephemeral DOCKER_GATE_RECLAIM=1 DOCKER_RECLAIM_SOFT_LIMIT_GB=12 bash scripts/docker-gate.sh'
  );
  assert.equal(scripts['docker:gate:lowdisk'], undefined);
  assert.equal(
    scripts['docker:gate:warm'],
    'DOCKER_GATE_CACHE_MODE=warm DOCKER_GATE_RECLAIM=1 bash scripts/docker-gate.sh'
  );
});

test('low-disk wrapper reclaims CI-local containers and volumes', () => {
  const lowDiskScript = readRepoFile('scripts/ci-local-lowdisk.sh');
  const reclaimScript = readRepoFile('scripts/docker-reclaim-ci-local.sh');

  assert.match(lowDiskScript, /trap cleanup EXIT/);
  assert.match(lowDiskScript, /bash scripts\/docker-reclaim-ci-local\.sh/);
  assert.match(lowDiskScript, /bash scripts\/ci-local-parity\.sh "\$\{MODE\}"/);
  assert.match(reclaimScript, /ci_local_pnpm_store/);
  assert.match(reclaimScript, /ci_local_sonar_cache/);
  assert.match(reclaimScript, /docker compose --profile ci-local rm -sf ci-postgres ci-parity/);
});
